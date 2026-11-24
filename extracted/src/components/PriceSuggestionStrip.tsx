import React, { useMemo } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, History, Check } from 'lucide-react';
import { Product, SaleInvoice, StoreSettings } from '../types/accounting';
import { formatCurrency } from '../utils/accounting';
import { computeSuggestedSellingPrices } from '../utils/priceSuggestion';

interface PriceSuggestionStripProps {
  costPrice: number;
  sellingPrice: number;
  category?: string;
  currency?: string;
  settings: StoreSettings;
  productId?: string;
  storeProducts?: Product[];
  historicalSales?: SaleInvoice[];
  onApplyPrice: (price: number) => void;
  compact?: boolean;
  autoAppliedHint?: string;
}

export const PriceSuggestionStrip: React.FC<PriceSuggestionStripProps> = ({
  costPrice,
  sellingPrice,
  category,
  currency,
  settings,
  productId,
  storeProducts,
  historicalSales,
  onApplyPrice,
  compact = false,
  autoAppliedHint,
}) => {
  const suggestion = useMemo(
    () =>
      computeSuggestedSellingPrices({
        costPrice,
        category,
        currency: currency || settings.currency,
        productId,
        storeProducts,
        historicalSales,
        currentSellingPrice: sellingPrice,
      }),
    [costPrice, category, currency, settings.currency, productId, storeProducts, historicalSales, sellingPrice]
  );

  if (costPrice <= 0 && !suggestion.lastSoldPrice && sellingPrice <= 0) {
    return null;
  }

  const evalState = suggestion.currentEvaluation;
  const isLoss = evalState?.status === 'loss';
  const isThinOrEven = evalState?.status === 'breakeven' || evalState?.status === 'thin';

  return (
    <div
      data-testid="price-suggestion-strip"
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/90 ${
        compact ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'
      } text-xs`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>اقتراح سعر البيع الذكي</span>
          {suggestion.storeCategoryAvgMargin !== null && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              متوسط ربح التصنيف {suggestion.storeCategoryAvgMargin}%
            </span>
          )}
          {autoAppliedHint && (
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              · {autoAppliedHint}
            </span>
          )}
        </div>

        {evalState && (
          <div
            data-testid="price-evaluation-badge"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border tabular-nums ${
              isLoss
                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                : isThinOrEven
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
            }`}
          >
            {isLoss ? (
              <AlertTriangle className="w-3 h-3 shrink-0" />
            ) : (
              <TrendingUp className="w-3 h-3 shrink-0" />
            )}
            <span>
              {evalState.statusArabic} ({evalState.profitPerUnit >= 0 ? '+' : ''}
              {formatCurrency(evalState.profitPerUnit, settings)} / وحدة ·{' '}
              {evalState.markupPercent}%)
            </span>
          </div>
        )}
      </div>

      {costPrice > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {suggestion.tiers.map((tier) => {
            const isSelected = Math.abs(sellingPrice - tier.price) < 0.01;
            const isRecommended = tier.id === 'recommended';
            return (
              <button
                key={tier.id}
                type="button"
                data-testid={`price-tier-${tier.id}`}
                onClick={() => onApplyPrice(tier.price)}
                className={`flex flex-col items-stretch justify-between gap-1.5 px-3 py-2 rounded-lg border text-right transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 border-slate-900 dark:border-amber-400 shadow-xs'
                    : isRecommended
                    ? 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-900 dark:text-amber-100 border-amber-300 dark:border-amber-700'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-[10px] font-bold opacity-90 flex items-center gap-1 leading-tight">
                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                  <span>{tier.labelArabic}</span>
                </div>
                <div className="font-mono font-black text-xs tabular-nums leading-tight">
                  {formatCurrency(tier.price, settings)}
                </div>
                <div className="text-[10px] opacity-80 font-mono tabular-nums leading-tight">
                  ربح +{formatCurrency(tier.profitPerUnit, settings)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {suggestion.lastSoldPrice !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-700/80 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <History className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>
              آخر سعر بيع مسجل:{' '}
              <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                {formatCurrency(suggestion.lastSoldPrice, settings)}
              </strong>
              {suggestion.averageSoldPrice !== null && (
                <span className="text-slate-500 dark:text-slate-400 mr-2">
                  (متوسط الفواتير: {formatCurrency(suggestion.averageSoldPrice, settings)})
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onApplyPrice(suggestion.lastSoldPrice!)}
            className="px-2.5 py-1 rounded-md bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-900 dark:text-sky-200 font-bold cursor-pointer"
          >
            اعتماد آخر سعر بيع
          </button>
        </div>
      )}
    </div>
  );
};
