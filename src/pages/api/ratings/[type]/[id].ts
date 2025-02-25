import type { NextApiRequest, NextApiResponse } from 'next';
import type { RatingData } from '../../../../types/ratings';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RatingData | { error: string }>
) {
  const { type, id } = req.query;

  if (!type || !id) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  try {
    // 调用 Python 脚本获取评分数据
    const response = await fetch(`http://localhost:8000/ratings/${type}/${id}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '获取评分数据失败');
    }

    // 添加类型标记
    data.type = type;

    res.status(200).json(data);
  } catch (error) {
    console.error('获取评分数据失败:', error);
    res.status(500).json({ error: '获取评分数据失败' });
  }
} 