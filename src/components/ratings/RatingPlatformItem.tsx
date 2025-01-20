interface RatingPlatformItemProps {
  logo: string;
  rating: number;
  reviewCount?: string;
  showPercentage?: boolean;
  additionalInfo?: string;
  className?: string;
}

export function RatingPlatformItem({
  logo,
  rating,
  reviewCount,
  showPercentage = false,
  additionalInfo,
  className = ''
}: RatingPlatformItemProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <img src={logo} alt="" className="w-8 h-8 object-contain" />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {rating || 'N/A'}{showPercentage ? '%' : ''}
          </span>
          {(reviewCount || additionalInfo) && (
            <div className="flex flex-col">
              {reviewCount && (
                <span className="text-sm text-gray-400">{reviewCount}</span>
              )}
              {additionalInfo && (
                <span className="text-sm text-gray-400">{additionalInfo}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 