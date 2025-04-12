// ==========================================
// 电影主创团队
// ==========================================
import { cn } from '../utils/utils';
import { getChineseJobTitle } from '../utils/jobTitles';
import { getImageUrl } from './image';

interface CreditMember {
  name: string;
  role?: string;
  imageUrl?: string;
  job?: string;
  profilePath?: string | null;
  character?: string;
}

interface CreditsProps {
  cast: CreditMember[];
  crew: CreditMember[];
  className?: string;
}

export function Credits({ cast, crew, className }: CreditsProps) {

  const getActorImageUrl = (profilePath: string | null | undefined): string => {
    if (!profilePath) {
      return `/default-avatar.png`;
    }
    if (profilePath.includes('/api/image-proxy')) {
      return profilePath;
    }
    return getImageUrl(profilePath, '中', 'profile');
  };

  return (
    <div className={cn("container mx-auto px-4 py-8", className)}>
      {/* 主创团队 */}
      {crew.length > 0 && (
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">主创团队(部分)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {crew.map((member, index) => (
              <div key={index} className="p-3 rounded-lg">
                <h3 className="font-medium text-gray-900 dark:text-white">{member.name}</h3>
                <p className="text-sm text-gray-500">{getChineseJobTitle(member.job || '')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 主演阵容 */}
      <section>
        <h2 className="text-2xl font-bold mb-4">演员阵容(部分)</h2>
        <div className="relative">
          <div className="overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
              {cast.map((member, index) => (
                <div key={index} className="flex flex-col items-center text-center space-y-2">
                  <div className="w-16 h-16 sm:w-20 sm:h-20">
                    <img
                      src={getActorImageUrl(member.profilePath)}
                      alt={member.name}
                      className="w-full h-full object-cover rounded-full border-2 border-gray-200"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `/default-avatar.png`;
                        target.onerror = null;
                      }}
                    />
                  </div>
                  <div className="w-full">
                    <h3 className="font-medium text-gray-900 text-sm truncate dark:text-white">
                      {member.name}
                    </h3>
                    {member.character && (
                      <p className="text-xs text-gray-500 truncate">
                        {member.character}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}