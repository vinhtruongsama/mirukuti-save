import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-6xl font-serif text-brand-emerald-600 mb-4">403</h1>
      <h2 className="text-2xl font-serif text-brand-stone-50 mb-2">アクセス拒否</h2>
      <p className="text-brand-stone-400 max-w-md mb-8">
        このページにアクセスする権限がありません。権限が不足しているか、現在の年度では利用できません。
      </p>
      <Link 
        to="/" 
        className="px-8 py-3 bg-brand-stone-800 hover:bg-brand-stone-700 text-brand-stone-200 rounded-xl transition-all text-sm font-bold border border-brand-stone-700 shadow-lg"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
