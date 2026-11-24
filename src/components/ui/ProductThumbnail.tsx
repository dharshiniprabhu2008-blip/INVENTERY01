import { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string;
  alt: string;
  sizeClass?: string;
}

export function ProductThumbnail({
  src,
  alt,
  sizeClass = 'h-10 w-10',
}: ProductThumbnailProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400`}
        aria-label={alt}
      >
        <Package className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 object-cover bg-slate-100`}
    />
  );
}
