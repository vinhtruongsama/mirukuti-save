// MemberDirectorySkeleton.tsx
export function MemberDirectorySkeleton() {
  return (
    <div className="w-full space-y-4 animate-pulse">
      {/* 1. Filter Bar Skeleton */}
      <div className="h-16 w-full bg-stone-100 rounded-[2rem]" />

      {/* 2. Table Head Skeleton */}
      <div className="grid grid-cols-5 gap-4 px-10 py-6 border-b border-stone-50 bg-stone-50/40 rounded-t-[2.5rem]">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 bg-stone-200 rounded w-24" />
        ))}
      </div>

      {/* 3. Table Rows Skeleton */}
      {[...Array(6)].map((_, idx) => (
        <div 
          key={idx} 
          className="grid grid-cols-5 gap-4 px-10 py-8 border-b border-stone-50 items-center transition-all bg-white"
        >
          {/* Avatar + Name Column */}
          <div className="flex items-center gap-4 col-span-1">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 shrink-0" />
            <div className="h-5 bg-stone-100 rounded w-32" />
          </div>
          
          {/* Email/MSSV Column */}
          <div className="space-y-2 col-span-1">
            <div className="h-4 bg-stone-100 rounded w-28" />
            <div className="h-3 bg-stone-100 rounded w-40" />
          </div>

          {/* Role Column */}
          <div className="col-span-1">
            <div className="h-10 bg-stone-100 rounded-full w-24" />
          </div>

          {/* Department/Year Column */}
          <div className="space-y-2 col-span-1">
            <div className="h-4 bg-stone-100 rounded w-32" />
            <div className="h-3 bg-stone-100 rounded w-20" />
          </div>

          {/* Actions Column */}
          <div className="flex justify-end gap-3 col-span-1">
            <div className="w-10 h-10 bg-stone-100 rounded-xl" />
            <div className="w-10 h-10 bg-stone-100 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
