// 电影职位翻译
export const jobTitles: Record<string, string> = {
  'Director': '导演',
  'Writer': '编剧',
  'Producer': '制片人',
  'Executive Producer': '执行制片人',
  'Director of Photography': '摄影指导',
  'Production Designer': '制作设计',
  'Editor': '剪辑',
  'Costume Designer': '服装设计',
  'Music': '音乐',
  'Original Music Composer': '原创音乐',
  'Screenplay': '剧本',
  'Story': '故事',
  'Novel': '原著',
  'Characters': '角色创作',
};

export function translateJobTitle(title: string): string {
  return jobTitles[title] || title;
}

export function translateJob(job: string): string {
  const jobTranslations: Record<string, string> = {
    'Director': '导演',
    'Executive Producer': '执行制片人',
    'Producer': '制片人',
    'Writer': '编剧',
    'Creator': '创作者',
    'Production': '制作',
    'Directing': '导演',
    'Writing': '编剧',
    'Acting': '演员',
  };

  return jobTranslations[job] || job;
}