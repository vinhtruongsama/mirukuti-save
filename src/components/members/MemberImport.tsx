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
  Download,
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
   * --- Task 1: File Parsing & Character Encoding ---
   * Handles multi-encoding detection for Japanese compatibility.
   * --- ファイル解析と文字エンコーディングの処理 ---
   */
  const parseFile = async (file: File) => {
    const reader = new FileReader();

    reader.onload = (e) => {
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

        setData(normalizeData(jsonData));
        toast.success(`${jsonData.length}件を読み込みました`);
      } catch (err) {
        toast.error('ファイルエラー: ' + (err as Error).message);
    } finally {
      // Done
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
            phone: row.phone,
            university_email: row.university_email,
            email: row.university_email || `${row.student_id}@system.temp`, // Required field fix
          }, { onConflict: 'mssv' })
          .select('id')
          .single();

        if (userError) throw userError;

        // 2. Link to 'club_memberships' for the current year
        const { error: memError } = await supabase
          .from('club_memberships')
          .upsert({
            user_id: user.id,
            academic_year_id: academic_year_id,
            role: 'member',
            university_year: row.grade,
            is_active: true
          }, { onConflict: 'user_id,academic_year_id' });

        if (memError) throw memError;
      }

      toast.success(`同期完了: ${validRows.length}件の会員情報を同期しました`);
      setData([]); // Reset on success
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error('同期エラー: ' + (err.message || 'Error syncing to DB'));
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
          className={`relative group flex flex-col items-center justify-center w-full h-[450px] border-[3px] border-dashed rounded-[3.5rem] cursor-pointer transition-all duration-700 bg-white shadow-2xl shadow-slate-100 ${
            isDragging ? 'border-[#4F5BD5] bg-slate-50 scale-[0.99]' : 'border-slate-100 hover:border-[#4F5BD5]/30'
          }`}
        >
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef}
            accept=".csv,.xlsx" 
            onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])} 
          />
          <div className="flex flex-col items-center text-center">
            <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center mb-8 transition-all duration-700 shadow-2xl ${isDragging ? 'bg-[#4F5BD5] text-white rotate-[15deg]' : 'bg-slate-50 text-slate-400 group-hover:scale-110'}`}>
              <Upload className="w-10 h-10" />
            </div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-2">会員データの同期 (Member Sync)</h3>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-8">Click to browse or drag & drop CSV / Excel</p>
            <div className="flex gap-4">
              <div className="px-6 py-2.5 bg-[#4F5BD5]/5 text-[#4F5BD5] rounded-2xl text-[11px] font-black tracking-widest uppercase border border-[#4F5BD5]/10">Legacy cp932 Support</div>
              <div className="px-6 py-2.5 bg-[#D62976]/5 text-[#D62976] rounded-2xl text-[11px] font-black tracking-widest uppercase border border-[#D62976]/10">Auto-Normalization</div>
            </div>
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
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 border border-slate-50">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                    <FileCheck2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-slate-800 tracking-tight">インポートプレビュー ({data.length}行)</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verify and confirm your sync operation</p>
                  </div>
               </div>
               <div className="flex gap-4">
                  <button onClick={() => setData([])} className="px-10 py-4 text-slate-400 font-black text-[12px] uppercase tracking-widest hover:text-slate-600 transition-colors">キャンセル</button>
                  <button 
                    onClick={syncToDatabase}
                    disabled={isUploading || hasErrors}
                    className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${
                      hasErrors ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-brand-stone-900 text-white hover:bg-black'
                    }`}
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    DBへアップロード (Sync Now)
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
      <div className="mt-8 p-10 bg-brand-stone-900 rounded-[3.5rem] text-white flex flex-col md:flex-row items-center gap-10 shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
            <Download className="w-48 h-48 rotate-[-15deg]" />
         </div>
         <div className="shrink-0">
            <div className="w-20 h-20 bg-white/10 backdrop-blur-3xl rounded-3xl flex items-center justify-center text-white border border-white/20">
               <AlertCircle className="w-10 h-10" />
            </div>
         </div>
         <div className="flex-1 space-y-3 z-10 text-center md:text-left">
            <h3 className="text-2xl font-black tracking-tight">インポート準備ガイド</h3>
            <p className="text-white/60 font-bold text-sm leading-relaxed max-w-xl">
               CSV形式で保存する際は「UTF-8 (コンマ区切り)」を推奨しますが、日本のExcel標準「Shift-JIS」も自動で補正されます。
               電話番号のハイフンや不要な空白、全角数字はシステム側で自動的に半角へクリーニングされます。
            </p>
         </div>
         <div className="shrink-0 z-10">
            <button className="px-10 py-5 bg-white text-brand-stone-900 rounded-3xl font-black tracking-tight text-[15px] hover:scale-105 transition-transform shadow-2xl active:scale-95">
               テンプレをDL (.xlsx)
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
               className="relative w-full max-w-5xl bg-white rounded-[3rem] shadow-2xl p-10 overflow-y-auto max-h-[90vh] custom-scrollbar"
             >
                <div className="flex justify-between items-center mb-8">
                   <h2 className="text-3xl font-black text-stone-900">スマートインポート (Smart Import)</h2>
                   <button onClick={onClose} className="p-3 bg-stone-50 rounded-2xl hover:bg-stone-900 hover:text-white transition-all shadow-sm">
                     <X size={24} />
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
