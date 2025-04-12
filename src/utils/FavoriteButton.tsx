// ==========================================
// 收藏按钮
// ==========================================
import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '../components/auth/AuthContext';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';

interface FavoriteButtonProps {
  mediaId: string;
  mediaType: string;
  title: string;
  poster: string;
  year: string;
  overview: string;
}

export function FavoriteButton({ mediaId, mediaType, title, poster, year, overview }: FavoriteButtonProps) {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [lists, setLists] = useState<Array<{id: number; name: string}>>([]);
  const [selectedList, setSelectedList] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [showCreateList, setShowCreateList] = useState(false);
  const [newList, setNewList] = useState({
    name: '',
    description: '',
    is_public: false
  });

  useEffect(() => {
    // 获取用户的收藏列表
    const fetchLists = async () => {
      try {
        const response = await fetch('/api/favorite-lists', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setLists(data);
          // 设置默认列表
          if (data.length > 0) {
            setSelectedList(data[0].id);
          }
        }
      } catch (error) {
        console.error('获取收藏列表失败:', error);
      }
    };

    if (user) {
      fetchLists();
    }
  }, [user]);

  const handleCreateList = async () => {
    try {
      const response = await fetch('/api/favorite-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newList)
      });

      if (response.ok) {
        const data = await response.json();
        setLists([...lists, data]);
        setSelectedList(data.id);
        setShowCreateList(false);
        setNewList({ name: '', description: '', is_public: false });
      }
    } catch (error) {
      console.error('创建收藏列表失败:', error);
    }
  };

  const handleFavorite = async () => {
    if (!user || !selectedList) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          media_id: mediaId,
          media_type: mediaType,
          title,
          year,
          poster,
          overview,
          list_id: selectedList,
          note
        })
      });

      if (response.ok) {
        setIsFavorited(true);
        setShowDialog(false);
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        disabled={isLoading}
        className={`fixed bottom-20 left-2 z-30 p-2 rounded-full backdrop-blur-sm transition-colors
          ${isFavorited 
            ? 'bg-yellow-500 hover:bg-yellow-600' 
            : 'bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20'
          }`}
        aria-label={isFavorited ? '修改收藏' : '收藏'}
      >
        <Star 
          className={`w-4 h-4 ${
            isFavorited 
              ? 'text-white' 
              : 'text-gray-700 dark:text-gray-200'
          }`} 
          fill={isFavorited ? 'currentColor' : 'none'}
        />
      </button>

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={isFavorited ? "修改收藏" : "添加到收藏"}
      >
        <div className="space-y-4">
          {showCreateList ? (
            <div className="space-y-4">
              <Input
                label="列表名称"
                value={newList.name}
                onChange={(e) => setNewList({...newList, name: e.target.value})}
              />
              <Textarea
                label="列表描述（可选）"
                value={newList.description}
                onChange={(e) => setNewList({...newList, description: e.target.value})}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={newList.is_public}
                  onCheckedChange={(checked) => setNewList({...newList, is_public: checked})}
                />
                <span>公开列表</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateList}>创建</Button>
                <Button variant="outline" onClick={() => setShowCreateList(false)}>取消</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <label className="block text-sm font-medium">选择收藏列表</label>
                <Button variant="outline" onClick={() => setShowCreateList(true)}>
                  创建新列表
                </Button>
              </div>
              <select
                value={selectedList || ''}
                onChange={(e) => setSelectedList(Number(e.target.value))}
                className="w-full rounded-md border-2 border-gray-300 dark:border-gray-600 
                  bg-white dark:bg-gray-700 
                  text-gray-900 dark:text-gray-100"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
              <Textarea
                label="添加备注（可选）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="添加你的观影感受..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleFavorite} disabled={isLoading}>
                  {isLoading ? '保存中...' : '保存'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
} 