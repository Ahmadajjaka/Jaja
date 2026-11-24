package com.almamo.hardware;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.CancellationSignal;
import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.tasks.Task;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException;
import java.security.MessageDigest;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {

    private final Executor bgExecutor = Executors.newSingleThreadExecutor();
    private boolean legacyTriedAfterNoCredential = false;
    private String lastCmError = "";
    private String lastServerClientIdUsed = "";

    private String getStringResourceByName(String name) {
        try {
            Context ctx = getContext();
            int resId = ctx.getResources().getIdentifier(name, "string", ctx.getPackageName());
            if (resId != 0) {
                String val = ctx.getString(resId);
                return val != null ? val.trim() : "";
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    /**
     * Prefers explicit caller client ID, then default_web_client_id generated from google-services.json,
     * then almamo_fallback_web_client_id in strings.xml.
     */
    private String resolveServerClientId(PluginCall call) {
        String gsClientId = getStringResourceByName("default_web_client_id");
        String passed = call != null ? call.getString("serverClientId") : null;
        if (passed != null && !passed.trim().isEmpty()) {
            // If google-services.json provided a real default_web_client_id and caller passed the static fallback,
            // prefer the google-services.json default_web_client_id automatically.
            if (!gsClientId.isEmpty() && passed.trim().equals(getStringResourceByName("almamo_fallback_web_client_id"))) {
                return gsClientId;
            }
            return passed.trim();
        }
        if (!gsClientId.isEmpty()) {
            return gsClientId;
        }
        return getStringResourceByName("almamo_fallback_web_client_id");
    }

    private String digestBytesHex(byte[] bytes, String algorithm) {
        try {
            MessageDigest md = MessageDigest.getInstance(algorithm);
            byte[] digest = md.digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < digest.length; i++) {
                if (i > 0) sb.append(':');
                sb.append(String.format("%02X", digest[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private JSObject collectSigningDiagnostics(String serverClientId) {
        JSObject diag = new JSObject();
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        diag.put("packageName", pkg);
        diag.put("serverClientId", serverClientId != null ? serverClientId : "");
        diag.put("googleServicesClientId", getStringResourceByName("default_web_client_id"));
        diag.put("hasGoogleServicesJson", !getStringResourceByName("default_web_client_id").isEmpty());
        diag.put("playServicesStatus", GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(ctx));

        String sha1 = "";
        String sha256 = "";
        try {
            PackageManager pm = ctx.getPackageManager();
            Signature[] signatures = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signingInfo = info.signingInfo;
                if (signingInfo != null) {
                    signatures = signingInfo.hasMultipleSigners()
                        ? signingInfo.getApkContentsSigners()
                        : signingInfo.getSigningCertificateHistory();
                }
            } else {
                @SuppressWarnings("deprecation")
                PackageInfo info = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
                @SuppressWarnings("deprecation")
                Signature[] legacySigs = info.signatures;
                signatures = legacySigs;
            }
            if (signatures != null && signatures.length > 0) {
                byte[] cert = signatures[0].toByteArray();
                sha1 = digestBytesHex(cert, "SHA-1");
                sha256 = digestBytesHex(cert, "SHA-256");
            }
        } catch (Exception ignored) {
        }
        diag.put("runtimeSha1", sha1);
        diag.put("runtimeSha256", sha256);
        return diag;
    }

    @PluginMethod
    public void getSigningDiagnostics(PluginCall call) {
        String serverClientId = resolveServerClientId(call);
        call.resolve(collectSigningDiagnostics(serverClientId));
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable", "ACTIVITY_UNAVAILABLE");
            return;
        }

        final String serverClientId = resolveServerClientId(call);
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("Missing serverClientId", "MISSING_CLIENT_ID");
            return;
        }

        this.lastCmError = "";
        this.lastServerClientIdUsed = serverClientId;
        this.legacyTriedAfterNoCredential = false;

        int gmsAvail = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity);
        if (gmsAvail != ConnectionResult.SUCCESS) {
            JSObject diag = collectSigningDiagnostics(serverClientId);
            call.reject(
                "Google Play Services غير متوفرة أو بحاجة للتحديث (status=" + gmsAvail + ") [DIAG:" + diag.toString() + "]",
                "PLAY_SERVICES_UNAVAILABLE"
            );
            return;
        }

        launchSignInWithGoogleOption(activity, call, serverClientId);
    }

    private void launchSignInWithGoogleOption(Activity activity, PluginCall call, String serverClientId) {
        try {
            CredentialManager credentialManager = CredentialManager.create(activity);
            GetSignInWithGoogleOption signInWithGoogleOption = new GetSignInWithGoogleOption.Builder(serverClientId)
                .build();

            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(signInWithGoogleOption)
                .build();

            credentialManager.getCredentialAsync(
                activity,
                request,
                new CancellationSignal(),
                bgExecutor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(@NonNull GetCredentialResponse result) {
                        if (resolveGoogleCredentialResult(activity, call, result)) {
                            return;
                        }
                        activity.runOnUiThread(() -> launchGoogleIdOneTapOption(activity, call, serverClientId));
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        if (e instanceof GetCredentialCancellationException) {
                            activity.runOnUiThread(() -> call.reject("User cancelled Google Sign-In", "USER_CANCELED"));
                            return;
                        }
                        lastCmError = e.getType() + ": " + (e.getMessage() != null ? e.getMessage() : "");
                        activity.runOnUiThread(() -> launchGoogleIdOneTapOption(activity, call, serverClientId));
                    }
                }
            );
        } catch (Exception ex) {
            lastCmError = ex.getClass().getSimpleName() + ": " + (ex.getMessage() != null ? ex.getMessage() : "");
            launchGoogleIdOneTapOption(activity, call, serverClientId);
        }
    }

    private void launchGoogleIdOneTapOption(Activity activity, PluginCall call, String serverClientId) {
        try {
            CredentialManager credentialManager = CredentialManager.create(activity);
            GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .setAutoSelectEnabled(false)
                .build();

            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build();

            credentialManager.getCredentialAsync(
                activity,
                request,
                new CancellationSignal(),
                bgExecutor,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(@NonNull GetCredentialResponse result) {
                        if (resolveGoogleCredentialResult(activity, call, result)) {
                            return;
                        }
                        activity.runOnUiThread(() -> launchLegacyGoogleSignIn(activity, call, serverClientId, false));
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException e) {
                        if (e instanceof GetCredentialCancellationException) {
                            activity.runOnUiThread(() -> call.reject("User cancelled Google Sign-In", "USER_CANCELED"));
                            return;
                        }
                        boolean hadNoCredential = (e instanceof NoCredentialException);
                        if (lastCmError.isEmpty()) {
                            lastCmError = e.getType() + ": " + (e.getMessage() != null ? e.getMessage() : "");
                        } else {
                            lastCmError = lastCmError + " | OneTap(" + e.getType() + ": " + (e.getMessage() != null ? e.getMessage() : "") + ")";
                        }
                        activity.runOnUiThread(() -> launchLegacyGoogleSignIn(activity, call, serverClientId, hadNoCredential));
                    }
                }
            );
        } catch (Exception ex) {
            launchLegacyGoogleSignIn(activity, call, serverClientId, false);
        }
    }

    private boolean resolveGoogleCredentialResult(Activity activity, PluginCall call, GetCredentialResponse result) {
        Credential credential = result.getCredential();
        if (
            credential instanceof CustomCredential &&
            GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())
        ) {
            try {
                GoogleIdTokenCredential googleCred = GoogleIdTokenCredential.createFrom(credential.getData());
                JSObject ret = new JSObject();
                ret.put("idToken", googleCred.getIdToken());
                ret.put("email", googleCred.getId());
                ret.put("displayName", googleCred.getDisplayName());
                if (googleCred.getProfilePictureUri() != null) {
                    ret.put("photoUrl", googleCred.getProfilePictureUri().toString());
                }
                ret.put("provider", "google-native-credential-manager");
                activity.runOnUiThread(() -> call.resolve(ret));
                return true;
            } catch (GoogleIdTokenParsingException ignored) {
                return false;
            }
        }
        return false;
    }

    private void launchLegacyGoogleSignIn(Activity activity, PluginCall call, String serverClientId, boolean noCredentialFromCm) {
        this.legacyTriedAfterNoCredential = noCredentialFromCm;
        try {
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(serverClientId)
                .requestEmail()
                .requestProfile()
                .build();

            GoogleSignInClient signInClient = GoogleSignIn.getClient(activity, gso);
            Intent signInIntent = signInClient.getSignInIntent();
            startActivityForResult(call, signInIntent, "handleLegacyGoogleSignInResult");
        } catch (Exception ex) {
            JSObject diag = collectSigningDiagnostics(serverClientId);
            diag.put("cmError", lastCmError);
            call.reject(
                (ex.getMessage() != null ? ex.getMessage() : "Native Google Sign-In failed") + " [DIAG:" + diag.toString() + "]",
                noCredentialFromCm ? "NO_GOOGLE_ACCOUNT" : "NATIVE_SIGN_IN_FAILED"
            );
        }
    }

    @ActivityCallback
    protected void handleLegacyGoogleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result != null ? result.getData() : null;
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        JSObject diag = collectSigningDiagnostics(lastServerClientIdUsed);
        diag.put("cmError", lastCmError);

        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account == null || account.getIdToken() == null || account.getIdToken().isEmpty()) {
                call.reject(
                    "Missing Google ID Token (check Web Client ID & SHA-1) [DIAG:" + diag.toString() + "]",
                    "MISSING_ID_TOKEN"
                );
                return;
            }
            JSObject ret = new JSObject();
            ret.put("idToken", account.getIdToken());
            ret.put("email", account.getEmail());
            ret.put("displayName", account.getDisplayName());
            if (account.getPhotoUrl() != null) {
                ret.put("photoUrl", account.getPhotoUrl().toString());
            }
            ret.put("provider", "google-native-gms");
            call.resolve(ret);
        } catch (ApiException apiEx) {
            int statusCode = apiEx.getStatusCode();
            diag.put("gmsStatusCode", statusCode);
            diag.put("gmsMessage", apiEx.getMessage() != null ? apiEx.getMessage() : "");

            if (
                statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED ||
                statusCode == CommonStatusCodes.CANCELED
            ) {
                call.reject("User cancelled Google Sign-In", "USER_CANCELED");
                return;
            }
            if (statusCode == CommonStatusCodes.DEVELOPER_ERROR) {
                call.reject(
                    "ApiException: 10 (DEVELOPER_ERROR) [DIAG:" + diag.toString() + "]",
                    "DEVELOPER_ERROR"
                );
                return;
            }
            if (statusCode == 12500 || statusCode == GoogleSignInStatusCodes.SIGN_IN_FAILED) {
                call.reject(
                    "ApiException: 12500 (SIGN_IN_FAILED - OAuth Consent Screen / Google Auth Config) [DIAG:" + diag.toString() + "]",
                    "GMS_12500"
                );
                return;
            }
            if (statusCode == CommonStatusCodes.SIGN_IN_REQUIRED || (legacyTriedAfterNoCredential && statusCode == GoogleSignInStatusCodes.INTERNAL_ERROR)) {
                call.reject("No signed-in Google account found on Android device [DIAG:" + diag.toString() + "]", "NO_GOOGLE_ACCOUNT");
                return;
            }
            if (statusCode == CommonStatusCodes.NETWORK_ERROR) {
                call.reject("Network error during Google Sign-In", "NETWORK_ERROR");
                return;
            }
            call.reject(
                "GoogleSignIn ApiException: " + statusCode + " " + (apiEx.getMessage() != null ? apiEx.getMessage() : "") + " [DIAG:" + diag.toString() + "]",
                "GMS_" + statusCode
            );
        } catch (Exception ex) {
            call.reject(
                (ex.getMessage() != null ? ex.getMessage() : "Google Sign-In error") + " [DIAG:" + diag.toString() + "]",
                "NATIVE_SIGN_IN_ERROR"
            );
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        try {
            CredentialManager credentialManager = CredentialManager.create(activity);
            credentialManager.clearCredentialStateAsync(
                new ClearCredentialStateRequest(),
                new CancellationSignal(),
                bgExecutor,
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void unused) {}

                    @Override
                    public void onError(@NonNull ClearCredentialException e) {}
                }
            );
        } catch (Exception ignored) {
        }

        try {
            String serverClientId = resolveServerClientId(call);
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(serverClientId)
                .requestEmail()
                .build();
            GoogleSignIn.getClient(activity, gso).signOut();
        } catch (Exception ignored) {
        }

        call.resolve();
    }
}
