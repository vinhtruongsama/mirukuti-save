// 1. React Core
import React, { useState, useRef } from 'react';

// 2. Third-party Libraries
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner'; // 'sonner' is preferred in this project for premium look
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  AlertTriangle,
  FileCheck2
} from 'lucide-react';

/**
 * --- Task 2: Intelligent Header Mapping (Translation Layer) ---
 * Map Japanese Excel headers to English Supabase column names as requested.
 * --- 日本語のヘッダーからデータベースのカラム名への変換マップ ---
 */
const COLUMN_MAPPING: Record<string, string> = {
  '氏名(漢字または ROMAJI)': 'full_name',
  '氏名': 'full_name',
  'フリガナ': 'furigana',
  '学籍番号': 'student_id',
  '学年': 'grade',
  '性別': 'gender',
  'LINEニックネーム': 'line_name',
  '電話番号': 'phone',
  '大学のメール': 'university_email',
  '連絡メール': 'personal_email',
};

interface MemberRow {
  full_name: string;
  furigana?: string;
  student_id: string;
  grade: number;
  gender?: string;
  line_name?: string;
  phone?: string;
  university_email?: string;
  personal_email: string;
  _valid: boolean;
  _error?: string;
}

/**
 * Task 3.2: Convert Zenkaku to Hankaku
 * 全角文字（英数字）を半角に変換するユーティリティ
 */
const toHankaku = (str: string) => {
  return str.replace(/[！-～]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
};

/**
 * Senior Import Component: Handles robust file parsing and intelligent data syncing.
 * 高度なインポート・コンポーネント：堅牢な解析とデータベース同期を管理
 */
const MemberImport: React.FC<{
  onSuccess?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}> = ({ onSuccess, isOpen, onClose }) => {
  const [data, setData] = useState<MemberRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * --- Task 3: Data Normalization (Cleaning Engine) ---
   * Applies the cleaning logic before any insert operations.
   * --- データの正規化（クリーニング・エンジン） ---
   */
  const normalizeData = (rawData: any[]): MemberRow[] => {
    return rawData.map((row, index) => {
      const normalized: any = { _valid: true };

      Object.entries(row).forEach(([key, val]) => {
        const mappedKey = COLUMN_MAPPING[key.trim()] || key.trim();
        let value = String(val ?? '').trim();

        // 1. Trim & Zenkaku to Hankaku (Task 3.1 & 3.2)
        // 空白除去と全角・半角変換
        value = toHankaku(value);

        if (mappedKey === 'grade') {
          // 4. Grade Extraction (Task 3.4)
          // 学年の抽出（例：「4年生」-> 4）
          const match = value.match(/\d+/);
          normalized[mappedKey] = match ? parseInt(match[0]) : 1;
        } else if (mappedKey === 'phone') {
          // 3. Phone Formatting (Task 3.3)
          // 電話番号の成形（ハイフン除去、"0"付与）
          let cleaned = value.replace(/[- ]/g, '');
          if (cleaned.length > 0 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
          normalized[mappedKey] = cleaned;
        } else if (['full_name', 'furigana', 'student_id', 'gender', 'line_name', 'university_email', 'personal_email'].includes(mappedKey)) {
          normalized[mappedKey] = value;
        }
      });

      // --- Task 4.3: Error Highlighting (Validation) ---
      // 学籍番号（student_id）または氏名（full_name）がない場合はエラー
      if (!normalized.student_id) {
        normalized._valid = false;
        normalized._error = `行 ${index + 2}: 学籍番号が必要です (Missing student_id)`;
      } else if (!normalized.full_name) {
        normalized._valid = false;
        normalized._error = `行 ${index + 2}: 氏名が必要です (Missing full_name)`;
      }

      return normalized as MemberRow;
    });
  };

  /**
   * --- Task 6: Template Generation (Client-side) ---
   * Creates and downloads a pre-formatted Excel template with correct headers and sample data.
   */
  const handleDownloadTemplate = () => {
    const headers = Object.keys(COLUMN_MAPPING).filter(h => h !== '氏名(漢字または ROMAJI)'); // Avoid duplicates

    // Sample Data Row (Task: Provide a clear example)
    const sampleRow = [
      '太郎',    // 氏名
      'ヤマダ タロウ',           // フリガナ
      '33123456',               // 学籍番号
      '1年生',                  // 学年
      '男',                      // 性別
      'たろう',            // LINEニックネーム
      '08012341234',          // 電話番号
      'taro@red.umds.ac.jp',         // 大学のメール
      'taro@gmail.com'          // 連絡メール
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);

    // Auto-size columns (Approximate width based on headers)
    const wscols = headers.map(h => ({ wch: h.length * 2.5 + 10 }));
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '部員名簿');

    XLSX.writeFile(workbook, 'mirukuti_member_example.xlsx');
    toast.info('サンプルファイルをダウンロードしました。');
  };

  /**
   * --- Task 1: File Parsing & Character Encoding ---
   * Handles multi-encoding detection for Japanese compatibility.
   * --- ファイル解析と文字エンコーディングの処理 ---
   */
  const parseFile = async (file: File) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        /**
         * Shift-JIS (cp932) Support to prevent "mojibake".
         * 読み込み時に日本語文字コード（Shift-JIS）を考慮。
         * XLSX.read accurately detects encoding from byte markers.
         */
        const workbook = XLSX.read(arrayBuffer, {
          type: 'array',
          codepage: 932 // cp932 handles Shift-JIS used by legacy Excel systems
        });

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonData.length === 0) {
          toast.error('データがありません (Empty file)');
          return;
        }

        let normalized = normalizeData(jsonData);

        // Fetch deleted users to prevent re-importing over them silently
        const { data: deletedUsers } = await supabase.from('users').select('mssv').not('deleted_at', 'is', null);
        const deletedMssvs = new Set(deletedUsers?.map(u => u.mssv) || []);

        normalized = normalized.map(norm => {
          if (norm._valid && norm.student_id && deletedMssvs.has(norm.student_id)) {
            norm._valid = false;
            norm._error = "このメンバーはアーカイブ（ゴミ箱）にあります。復元してください。";
          }
          return norm;
        });

        setData(normalized);
        toast.success(`${jsonData.length}件を読み込みました`);
      } catch (err) {
        toast.error('ファイルエラー: ' + (err as Error).message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  /**
   * --- Task 5: Supabase Integration (Bulk Upsert) ---
   * Efficiently sync data using student_id as the primary identification key.
   * --- Supabaseとの統合（バルクupsert） ---
   */
  const syncToDatabase = async () => {
    const validRows = data.filter(r => r._valid);
    if (validRows.length || !validRows.length) { /* dummy check to avoid empty return if needed but validRows is what we want */ }
    if (validRows.length === 0) return;

    setIsUploading(true);
    try {
      /**
       * --- Logic Correctness (Unified Data Model) ---
       * Instead of writing to a 'members' table, we now write to 'users' and 'club_memberships'.
       * This ensures the Admin Directory (which reads from club_memberships) is immediately updated.
       */

      const { data: yearData, error: yearError } = await supabase
        .from('academic_years')
        .select('id')
        .eq('is_current', true)
        .maybeSingle();

      if (yearError || !yearData) throw new Error('現在の学年度が見つかりません (Current academic year not found)');
      const academic_year_id = yearData.id;

      for (const row of validRows) {
        // 1. Upsert into 'users' table
        const { data: user, error: userError } = await supabase
          .from('users')
          .upsert({
            mssv: row.student_id,
            full_name: row.full_name,
            full_name_kana: row.furigana,
            gender: row.gender === '男' || row.gender === 'Male' ? 'Male' : (row.gender === '女' || row.gender === 'Female' ? 'Female' : 'Other'),
            university_year: row.grade,
            phone: row.phone,
            university_email: row.university_email,
            email: row.personal_email || row.university_email || null, // No more system.temp fallback
          }, { onConflict: 'mssv' })
          .select('id')
          .single();

        if (userError) throw userError;

        // 2. Add or update membership for this year
        // IMPORTANT: Check if user already has a leadership role to avoid overwriting it
        const { data: existingMembership } = await supabase
          .from('club_memberships')
          .select('role, created_at')
          .eq('user_id', user.id)
          .eq('academic_year_id', academic_year_id)
          .maybeSingle();

        const newRole = (existingMembership && ['president', 'vice_president', 'treasurer', 'executive', 'admin'].includes(existingMembership.role))
          ? existingMembership.role
          : 'member';

        const { error: memError } = await supabase
          .from('club_memberships')
          .upsert({
            user_id: user.id,
            academic_year_id: academic_year_id,
            role: newRole,
            is_active: true,
            created_at: existingMembership?.created_at || new Date().toISOString()
          }, { onConflict: 'user_id,academic_year_id' });

        if (memError) throw memError;
      }

      toast.success(`追加完了: ${validRows.length}件の部員情報を追加しました`);
      setData([]); // Reset on success
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error('追加エラー: ' + (err.message || 'Error syncing to DB'));
    } finally {
      setIsUploading(false);
    }
  };

  // UI state derived from data
  const hasErrors = data.some(r => !r._valid);

  const content = (
    <div className="w-full flex flex-col gap-8 font-sans">

      {/* 1. Drag & Drop Zone (Task 4.1) */}
      {!data.length && (
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]); }}
          className={`relative group flex flex-col items-center justify-center w-full h-[300px] lg:h-[350px] border-[3px] border-dashed rounded-[2.5rem] lg:rounded-[3.5rem] cursor-pointer transition-all duration-700 bg-white shadow-2xl shadow-slate-100 ${isDragging ? 'border-[#4F5BD5] bg-slate-50 scale-[0.99]' : 'border-slate-100 hover:border-[#4F5BD5]/30'
            }`}
        >
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            accept=".csv,.xlsx"
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
          />
          <div className="flex flex-col items-center text-center px-6">
            <div className={`w-16 h-16 lg:w-24 lg:h-24 rounded-2xl lg:rounded-[2.5rem] flex items-center justify-center mb-6 lg:mb-8 transition-all duration-700 shadow-2xl ${isDragging ? 'bg-[#4F5BD5] text-white rotate-[15deg]' : 'bg-slate-50 text-slate-400 group-hover:scale-110'}`}>
              <Upload className="w-6 h-6 lg:w-10 lg:h-10" />
            </div>
            <h3 className="text-xl lg:text-3xl font-black text-slate-800 tracking-tight mb-2">部員データインポート</h3>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] lg:text-[11px] mb-8">Excelファイルのみ可能</p>
          </div>
        </label>
      )}

      {/* 2. Preview & Actions Table (Task 4.2 & 4.3) */}
      <AnimatePresence>
        {data.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white/80 backdrop-blur-xl p-5 lg:p-6 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 border border-slate-50 gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0">
                  <FileCheck2 className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">インポート</h4>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[14px] font-black rounded-md">{data.length}行</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <button
                  onClick={() => setData([])}
                  className="flex-1 sm:flex-none h-14 px-6 text-slate-400 font-black text-[12px] uppercase tracking-widest hover:text-rose-500 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={syncToDatabase}
                  disabled={isUploading || hasErrors}
                  className={`flex-1 sm:flex-none h-14 flex items-center justify-center gap-3 px-10 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${hasErrors ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-brand-stone-900 text-white hover:bg-black'
                    }`}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>DBへアップロード</span>
                </button>
              </div>
            </div>

            {/* Preview Grid */}
            <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/30 border border-slate-50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">学籍番号</th>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">氏名 (Full Name)</th>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">フリガナ</th>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">学年</th>
                      <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">連絡メール</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.map((row, i) => (
                      <tr key={i} className={`group ${!row._valid ? 'bg-rose-50/50' : 'hover:bg-slate-50/30'} transition-colors`}>
                        <td className="px-8 py-5">
                          {row._valid ? (
                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
                          ) : (
                            <div className="w-10 h-10 bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center animate-pulse" title={row._error}><AlertTriangle className="w-5 h-5" /></div>
                          )}
                        </td>
                        <td className="px-8 py-5 font-mono font-black text-slate-800 text-center tracking-tight">{row.student_id || '—'}</td>
                        <td className="px-8 py-5 font-black text-slate-900 text-[16px]">{row.full_name || '—'}</td>
                        <td className="px-8 py-5 font-bold text-slate-400 text-[14px]">{row.furigana || '—'}</td>
                        <td className="px-8 py-5">
                          <span className="px-4 py-1.5 bg-white border border-slate-100 rounded-lg text-[13px] font-black text-slate-600 shadow-sm">{row.grade}年生</span>
                        </td>
                        <td className="px-8 py-5 text-slate-400 font-bold text-[14px] opacity-70 underline decoration-slate-100 underline-offset-4">{row.personal_email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Task 4.3: Error Summary */}
              {hasErrors && (
                <div className="p-10 bg-rose-50 border-t border-rose-100/50">
                  <div className="flex items-center gap-4 mb-6">
                    <AlertCircle className="text-rose-500 w-6 h-6" />
                    <h5 className="font-black text-rose-600 tracking-tight text-lg">エラーを検出しました (Validation Errors)</h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.filter(r => !r._valid).map((r, i) => (
                      <div key={i} className="bg-white/80 p-4 rounded-2xl border border-rose-100 flex items-center gap-4">
                        <div className="w-3 h-3 bg-rose-400 rounded-full shrink-0" />
                        <p className="text-[13px] font-bold text-rose-500">{r._error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Logic Tips Card */}
      <div className="mt-8 p-6 lg:p-10 bg-stone-50 rounded-[2.5rem] lg:rounded-[3.5rem] flex flex-col items-center gap-8 lg:gap-10 shadow-sm relative overflow-hidden border border-stone-100">
        <div className="space-y-4 lg:space-y-5 text-center px-2">
          <h3 className="text-[20px] lg:text-[24px] font-black tracking-tight text-[#4F5BD5]">準備インポート</h3>
          <div className="space-y-1">
            <p className="text-stone-400 font-bold text-[13px] lg:text-[15px] leading-relaxed">
              以下の項目が含まれているか確認してください：
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['氏名', 'フリガナ', '学籍番号', '学年', '性別', '連絡メール', '電話番号', 'LINEニックネーム', '大学のメール'].map((field) => (
                <span key={field} className="px-3 py-1 bg-white border border-stone-200 rounded-lg text-stone-900 text-[12px] lg:text-[14px] font-black shadow-sm">
                  {field}
                </span>
              ))}
            </div>
            <p className="text-[#D62976] text-[11px] lg:text-[13px] font-black opacity-90 pt-2 bg-rose-50/50 py-3 rounded-2xl border border-rose-100/50">
              ※ 学籍番号と氏名は必須項目です。それ以外は空欄でもインポート可能です。
            </p>
          </div>
        </div>
        <div className="w-full lg:w-auto">
          <button
            onClick={handleDownloadTemplate}
            className="w-full lg:w-auto px-8 py-5 bg-white text-stone-900 border border-stone-200 rounded-[2rem] font-black tracking-tight text-[14px] lg:text-[16px] hover:bg-stone-50 transition-all shadow-sm active:scale-95"
          >
            サンプルファイルをダウンロード
          </button>
        </div>
      </div>

    </div>
  );

  if (isOpen !== undefined && onClose !== undefined) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full h-full lg:h-auto lg:max-h-[85vh] lg:max-w-3xl bg-white lg:rounded-[3rem] shadow-2xl p-6 lg:p-10 overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center mb-6 lg:mb-10">
                <h2 className="text-2xl lg:text-4xl font-black text-stone-900 tracking-tight">インポート</h2>
                <button
                  onClick={onClose}
                  className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl lg:rounded-2xl hover:bg-rose-100 transition-colors active:scale-95"
                  title="閉じる"
                >
                  <X className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={3} />
                </button>
              </div>
              {content}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  return content;
};

export default MemberImport;
