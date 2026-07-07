import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Download, Square, X } from 'lucide-react';

export type ExcelExportFieldOption = {
  key: string;
  label: string;
  description?: string;
  group?: string;
};

type ExcelExportModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  fields: ExcelExportFieldOption[];
  fixedFields?: ExcelExportFieldOption[];
  defaultSelectedKeys?: string[];
  onClose: () => void;
  onConfirm: (selectedKeys: string[]) => void;
  confirmLabel?: string;
};

const UI_TEXT = {
  close: '閉じる',
  confirm: 'Excelを書き出す',
  other: 'その他',
  selectAll: 'すべて選択',
  clearAll: 'すべて解除',
  noResultsTitle: '該当する項目が見つかりません。',
  noResultsDescription: '表示できる項目がありません。',
  expandGroup: '項目を個別に選ぶ',
  collapseGroup: '項目一覧を閉じる',
  summaryLabel: '設定の確認',
  step: 'STEP 1',
  cancel: 'キャンセル',
} as const;

export default function ExcelExportModal({
  isOpen,
  title,
  description,
  fields,
  fixedFields = [],
  defaultSelectedKeys,
  onClose,
  onConfirm,
  confirmLabel = UI_TEXT.confirm,
}: ExcelExportModalProps) {
  const initialKeys = useMemo(
    () => (defaultSelectedKeys?.length ? defaultSelectedKeys : fields.map((field) => field.key)),
    [defaultSelectedKeys, fields]
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialKeys);
  const [expandedGroupName, setExpandedGroupName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedKeys(initialKeys);
      setExpandedGroupName(null);
    }
  }, [initialKeys, isOpen]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, ExcelExportFieldOption[]>();

    fields.forEach((field) => {
      const groupName = field.group || UI_TEXT.other;
      const current = groups.get(groupName) || [];
      current.push(field);
      groups.set(groupName, current);
    });

    return Array.from(groups.entries());
  }, [fields]);

  const totalExportCount = fixedFields.length + selectedKeys.length;

  const toggleField = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleGroupSelection = (groupFields: ExcelExportFieldOption[]) => {
    setSelectedKeys((current) => {
      const currentSet = new Set(current);
      const allSelected = groupFields.every((field) => currentSet.has(field.key));

      if (allSelected) {
        return current.filter((key) => !groupFields.some((field) => field.key === key));
      }

      groupFields.forEach((field) => currentSet.add(field.key));
      return fields.map((field) => field.key).filter((key) => currentSet.has(key));
    });
  };

  const toggleGroupExpanded = (groupName: string) => {
    setExpandedGroupName((current) => (current === groupName ? null : groupName));
  };

  const handleConfirm = () => {
    onConfirm(selectedKeys);
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#bf9fff] bg-opacity-70 backdrop-blur-[2px] transition hover:bg-opacity-80"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-[84rem] flex-col overflow-hidden rounded-[2rem] border border-[#d8cff8] bg-[#eee7ff] shadow-[0_40px_120px_rgba(91,66,214,0.18)]"
          >
            <div className="shrink-0 px-7 pb-6 pt-8 sm:px-9">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="inline-flex rounded-full bg-white px-4 py-2 shadow-sm">
                  <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#ff4d73]">
                    {UI_TEXT.step}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label={UI_TEXT.close}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-stone-500 shadow-sm transition hover:bg-stone-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="text-center">
                <h2 className="text-[2.05rem] font-black tracking-tight text-[#2f67f6] sm:text-[2.5rem]">
                  {title}
                </h2>
                {description ? (
                  <p className="mx-auto mt-3 max-w-3xl text-sm font-medium leading-6 text-stone-500">
                    {description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mx-7 mb-5 flex-1 overflow-y-auto rounded-[2rem] border border-[#ebe5ff] bg-white px-7 py-6 shadow-[0_16px_40px_rgba(91,66,214,0.08)] sm:mx-9 sm:py-7">
              <div className="mb-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedKeys(fields.map((field) => field.key))}
                  className="inline-flex min-w-[120px] items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[12px] font-black text-stone-700 shadow-sm transition hover:-translate-y-[1px] hover:border-stone-300 hover:bg-stone-50"
                >
                  {UI_TEXT.selectAll}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys([])}
                  className="inline-flex min-w-[120px] items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[12px] font-black text-stone-500 shadow-sm transition hover:-translate-y-[1px] hover:border-stone-300 hover:bg-stone-50"
                >
                  {UI_TEXT.clearAll}
                </button>
              </div>

              {groupedFields.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-10 text-center">
                  <p className="text-sm font-black text-stone-700">{UI_TEXT.noResultsTitle}</p>
                  <p className="mt-2 text-sm font-medium text-stone-500">
                    {UI_TEXT.noResultsDescription}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-3">
                    {groupedFields.map(([groupName, groupFields]) => {
                      const selectedCount = groupFields.filter((field) => selectedSet.has(field.key)).length;
                      const allSelected = selectedCount === groupFields.length && groupFields.length > 0;
                      const partiallySelected = selectedCount > 0 && !allSelected;
                      const isExpanded = expandedGroupName === groupName;

                      return (
                        <section
                          key={groupName}
                          className="rounded-[1.45rem] border border-stone-200 bg-white p-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.03)] sm:p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggleGroupSelection(groupFields)}
                              className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            >
                              <div
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                  allSelected
                                    ? 'bg-[#15989f] text-white'
                                    : partiallySelected
                                      ? 'border-2 border-[#15989f] bg-white text-[#15989f]'
                                      : 'bg-stone-100 text-stone-400'
                                }`}
                              >
                                {allSelected ? (
                                  <Check className="h-4 w-4" />
                                ) : partiallySelected ? (
                                  <div className="h-2 w-2 rounded-full bg-[#15989f]" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <h3 className="text-[15px] font-black leading-tight text-stone-900">
                                  {groupName}
                                </h3>
                                <p className="mt-0.5 text-[13px] font-medium leading-none text-stone-500">
                                  {selectedCount} / {groupFields.length}
                                </p>
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleGroupExpanded(groupName)}
                              aria-label={isExpanded ? UI_TEXT.collapseGroup : UI_TEXT.expandGroup}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50"
                            >
                              <ChevronDown
                                className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  {expandedGroupName ? (
                    (() => {
                      const expandedGroup = groupedFields.find(([groupName]) => groupName === expandedGroupName);
                      if (!expandedGroup) return null;

                      const [groupName, groupFields] = expandedGroup;

                      return (
                        <section className="rounded-[1.6rem] border border-stone-200 bg-[#fcfbff] p-4 shadow-[0_24px_60px_rgba(91,66,214,0.08)] sm:p-5">
                          <div className="mb-4">
                            <h3 className="text-base font-black text-stone-900">{groupName}</h3>
                            <p className="mt-0.5 text-sm font-medium text-stone-500">
                              {groupFields.filter((field) => selectedSet.has(field.key)).length} /{' '}
                              {groupFields.length}
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {groupFields.map((field) => {
                              const selected = selectedSet.has(field.key);

                              return (
                                <button
                                  key={field.key}
                                  type="button"
                                  onClick={() => toggleField(field.key)}
                                  className={`rounded-[1.2rem] border px-4 py-3 text-left transition-all ${
                                    selected
                                      ? 'border-[#5b42d6] bg-[#f4f1ff] shadow-sm'
                                      : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                        selected
                                          ? 'bg-[#5b42d6] text-white'
                                          : 'bg-stone-100 text-stone-400'
                                      }`}
                                    >
                                      {selected ? (
                                        <Check className="h-4 w-4" />
                                      ) : (
                                        <Square className="h-4 w-4" />
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-sm font-black text-stone-900">
                                        {field.label}
                                      </p>
                                      {field.description ? (
                                        <p className="mt-1 text-xs font-medium leading-5 text-stone-500">
                                          {field.description}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })()
                  ) : null}
                </div>
              )}
            </div>

            <div className="shrink-0 px-7 pb-7 pt-0 sm:px-9 sm:pb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="text-sm font-bold text-stone-700">
                  <p className="text-[13px] uppercase tracking-[0.12em] text-stone-400">
                    {UI_TEXT.summaryLabel}
                  </p>
                  <p className="mt-2 text-[15px] text-stone-900">
                    {totalExportCount} 項目を書き出します
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-2xl bg-white px-6 py-3 text-[13px] font-black text-stone-600 shadow-sm transition hover:bg-stone-50"
                  >
                    {UI_TEXT.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b42d6] px-8 py-3 text-[13px] font-black text-white shadow-[0_12px_28px_rgba(91,66,214,0.28)] transition hover:bg-[#4f38ca]"
                  >
                    <Download className="h-4 w-4" />
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
