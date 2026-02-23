// @ts-nocheck
import { Layout, Coffee, Rss, Camera } from 'lucide-react'

export const CATEGORIES = [
  { id: 'all', name: 'Timeline', icon: Layout },
  { id: 'life', name: 'Lifestyle', icon: Coffee },
  { id: 'tech', name: 'Tech & Dev', icon: Rss },
  { id: 'art', name: 'Photography', icon: Camera },
]

export const FEEDS = [
  {
    id: 1,
    name: 'Hacker News',
    category: 'tech',
    icon: 'Y',
    url: 'https://news.ycombinator.com/rss',
    siteUrl: 'https://news.ycombinator.com',
  },
  {
    id: 2,
    name: 'Fuji Love',
    category: 'art',
    icon: '📷',
    url: 'https://example.com/fuji-love/rss.xml',
    siteUrl: 'https://example.com/fuji-love',
  },
  {
    id: 3,
    name: '周末做点什么',
    category: 'life',
    icon: '☕',
    url: 'https://example.com/coffee/rss.xml',
    siteUrl: 'https://example.com/coffee',
  },
  {
    id: 4,
    name: 'Wait But Why',
    category: 'life',
    icon: '💡',
    url: 'https://waitbutwhy.com/feed',
    siteUrl: 'https://waitbutwhy.com',
  },
]

export const ARTICLES = [
  {
    id: 101,
    feedId: 2,
    feedName: 'Fuji Love',
    title: 'X100VI 街头实战：Classic Negative 的魅力',
    summary:
      '在东京雨夜试拍一圈后，我更确定这台相机的直出表现非常稳定：阴影有层次，高光不过曝，氛围感很强。',
    author: 'Kenji Suzuki',
    date: '20m ago',
    readTime: '4 min',
    content: `
      <p class="lead">胶片模拟不仅是滤镜，更是富士影像语言的一部分。它让数码时代的照片仍然保留温度与叙事感。</p>

      <p>这周我带着 X100VI 在东京雨夜拍了一圈。<strong>Classic Negative</strong> 依旧是最稳妥的街拍方案：高光偏暖、阴影偏冷，画面层次清晰，城市灯光也不会显得刺眼。</p>

      <h3>关于对焦速度</h3>
      <p>相比前代，这一代对焦明显更快。即使在暗光场景里抓拍行人，成功率也比以前高很多。街拍时你可以把注意力放回构图，而不是担心错焦。</p>

      <blockquote>
        "摄影不应该是坐在电脑前拉曲线，而应该是走在街头观察光影。每一次快门，都是对瞬间的致敬。"
      </blockquote>

      <div class="image-container">
         <img src="https://images.unsplash.com/photo-1552975084-6e027cd345c2?auto=format&fit=crop&q=80&w=1000" alt="Shibuya Rain" />
      </div>
      <p class="caption">Shot on X100VI, ISO 3200, f/2.0</p>

      <h3>技术参数配置</h3>
      <p>为了获得更稳定的胶片感，我调整了颗粒、色彩和曲线。下面是我常用的一套参数，可直接参考：</p>

      <div class="code-wrapper">
        <pre><code>// X100VI Custom Recipe: "Neo Tokyo"
Film Simulation: Classic Neg
Grain Effect: Strong, Large
Color Chrome Effect: Strong
Color Chrome FX Blue: Weak
White Balance: Auto, R:-2 B:4
Dynamic Range: DR400
Tone Curve: H-1 S-2
Sharpness: -1</code></pre>
      </div>

      <h3>直出的快感</h3>
      <p>以前我习惯拍 RAW 再慢慢后期。现在我更常直接导出 JPEG 发到手机。那种“所见即所得”的效率，反而让我重新找回了拍照的乐趣。</p>
    `,
    isRead: false,
    isStarred: true,
    image: 'https://images.unsplash.com/photo-1542051841-863375cfde99?auto=format&fit=crop&q=80&w=1000',
  },
  {
    id: 102,
    feedId: 3,
    feedName: '周末做点什么',
    title: '手冲咖啡指南：如何冲出一杯干净的浅烘',
    summary:
      '水温、研磨度和注水节奏决定一杯咖啡的风味。掌握三个关键点，口感会明显提升。',
    author: 'Barista Daily',
    date: '2h ago',
    readTime: '8 min',
    content:
      '<p>从豆子新鲜度、水温控制到分段注水，手冲的每一步都会影响萃取结果。建议先固定变量，再逐项微调。</p>',
    isRead: true,
    isStarred: false,
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=1000',
  },
  {
    id: 103,
    feedId: 1,
    feedName: 'Hacker News',
    title: 'Show HN: I built a minimal RSS reader in 200 lines of code',
    summary:
      'No AI, no algorithms, just raw XML parsing. Sometimes we need to go back to basics. The code is open source and available on GitHub.',
    author: 'dev_guy',
    date: '1d ago',
    readTime: '12 min',
    content: '<p>Simplicity is the ultimate sophistication...</p>',
    isRead: false,
    isStarred: false,
    image: null,
  },
  {
    id: 104,
    feedId: 4,
    feedName: 'Wait But Why',
    title: 'The Tail End',
    summary:
      'It turns out that when I graduated from high school, I had already used up 93% of my in-person parent time.',
    author: 'Tim Urban',
    date: '1d ago',
    readTime: '15 min',
    content: '<p>Life is short...</p>',
    isRead: true,
    isStarred: true,
    image: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?auto=format&fit=crop&q=80&w=1000',
  },
]
