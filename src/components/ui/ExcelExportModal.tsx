import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, FileSpreadsheet, Square, X } from 'lucide-react';

export type ExcelExportFieldOption = {
  key: string;
  label: string;
  description?: string;
};

type ExcelExportModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  fields: ExcelExportFieldOption[];
  defaultSelectedKeys?: string[];
  onClose: () => void;
  onConfirm: (selectedKeys: string[]) => void;
  confirmLabel?: string;
};

export default function ExcelExportModal({
  isOpen,
  title,
  description,
  fields,
  defaultSelectedKeys,
  onClose,
  onConfirm,
  confirmLabel = 'Export Excel',
}: ExcelExportModalProps) {
  const initialKeys = useMemo(
    () => (defaultSelectedKeys?.length ? defaultSelectedKeys : fields.map((field) => field.key)),
    [defaultSelectedKeys, fields]
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialKeys);

  useEffect(() => {
    if (isOpen) {
      setSelectedKeys(initialKeys);
    }
  }, [initialKeys, isOpen]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleField = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const handleConfirm = () => {
    if (selectedKeys.length === 0) return;
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
            className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            className="relative w-full max-w-4xl overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.22)]"
          >
            <div className="bg-gradient-to-r from-[#0f8b8d] via-[#4F5BD5] to-[#D62976] px-6 py-6 text-white sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/75">
                    Export Setup
                  </p>
                  <h2 className="mt-2 text-2xl font-black leading-tight sm:text-[2rem]">{title}</h2>
                  <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-white/85">
                    {description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white transition hover:bg-white/25"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <div className="mb-5 flex flex-col gap-3 rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-stone-400">
                    Selected Fields
                  </p>
                  <p className="mt-1 text-sm font-bold text-stone-700">
                    {selectedKeys.length} / {fields.length} cột sẽ được đưa vào file Excel.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedKeys(fields.map((field) => field.key))}
                    className="rounded-xl bg-white px-4 py-2 text-[12px] font-black text-stone-700 shadow-sm transition hover:bg-stone-100"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedKeys([])}
                    className="rounded-xl bg-white px-4 py-2 text-[12px] font-black text-stone-500 shadow-sm transition hover:bg-stone-100"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
              </div>

              <div className="grid max-h-[48vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {fields.map((field) => {
                  const selected = selectedSet.has(field.key);
                  return (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => toggleField(field.key)}
                      className={`rounded-[1.4rem] border px-4 py-4 text-left transition-all ${
                        selected
                          ? 'border-[#4F5BD5] bg-indigo-50/80 shadow-sm'
                          : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg ${
                            selected ? 'bg-[#4F5BD5] text-white' : 'bg-stone-100 text-stone-400'
                          }`}
                        >
                          {selected ? <Check className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-stone-900">{field.label}</p>
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
            </div>

            <div className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="text-sm font-bold text-stone-500">
                File Excel sẽ chỉ chứa các trường bạn đang chọn.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl bg-white px-5 py-3 text-[13px] font-black text-stone-600 shadow-sm transition hover:bg-stone-100"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={selectedKeys.length === 0}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#4F5BD5] px-5 py-3 text-[13px] font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-[#4250cb] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
