import type { FetchStatus } from '../../types/status';

interface ErrorMessageProps {
  status: FetchStatus;
  errorDetail?: string;
  onRetry: () => void;
}

export function ErrorMessage({ 
  status,
  errorDetail, 
  onRetry 
}: ErrorMessageProps) {
  // 只在特定错误状态下显示重试按钮
  const shouldShowRetry = ['rate_limit', 'timeout', 'fail', 'not_found', 'no_rating', 'error'].includes(status);

  return (
    <div className="flex flex-col items-center justify-center py-0 text-center">
      {errorDetail && (
        <div className="text-gray-400 text-sm mb-4">{errorDetail}</div>
      )}
      {shouldShowRetry && (
        <button
          onClick={onRetry}
          className="text-blue-500 text-sm mb-0 rounded-lg hover:bg-yellow-600 transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}

export default ErrorMessage; 