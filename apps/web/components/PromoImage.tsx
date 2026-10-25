import { monogram, type LinkCreative } from '@/lib/creative';

export function PromoImage({ creative, story = false }: { creative: LinkCreative; story?: boolean }) {
  const width = story ? 1080 : 1200;
  const height = story ? 1920 : 630;
  const titleSize = story ? 76 : 62;
  const logoSize = story ? 270 : 180;
  return (
    <div style={{ width, height, display: 'flex', flexDirection: story ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: story ? 52 : 56, padding: story ? 80 : 72, background: 'linear-gradient(135deg, #101820 0%, #172b36 55%, #145b57 100%)', color: '#f7faf9', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ width: logoSize, height: logoSize, flexShrink: 0, borderRadius: story ? 54 : 38, background: '#d5f36a', color: '#101820', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: logoSize * 0.38, fontWeight: 800 }}>
        {creative.logoData ? <img src={creative.logoData} width={logoSize} height={logoSize} style={{ objectFit: 'cover' }} /> : monogram(creative.name)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: story ? 'center' : 'flex-start', minWidth: 0, textAlign: story ? 'center' : 'left', gap: story ? 24 : 16 }}>
        <div style={{ display: 'flex', color: '#d5f36a', fontSize: story ? 30 : 24, fontWeight: 700, letterSpacing: 5 }}>BRANDBID</div>
        <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 800, lineHeight: 1.08, maxWidth: story ? 900 : 820, overflow: 'hidden' }}>{creative.name}</div>
        {creative.description && <div style={{ display: 'flex', color: '#d1dddb', fontSize: story ? 36 : 28, lineHeight: 1.3, maxWidth: story ? 880 : 800, maxHeight: story ? 260 : 110, overflow: 'hidden' }}>{creative.description}</div>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: story ? 22 : 10, color: '#d5f36a', fontSize: story ? 32 : 24, fontWeight: 700 }}>
          <span>{creative.rank ? `#${creative.rank} on the leaderboard` : 'On the leaderboard'}</span>
        </div>
        {story && <div style={{ display: 'flex', marginTop: 34, padding: '18px 28px', border: '2px solid #d5f36a', borderRadius: 999, color: '#f7faf9', fontSize: 30 }}>LINK IN STICKER</div>}
        <div style={{ display: 'flex', marginTop: story ? 72 : 22, color: '#aabbb8', fontSize: story ? 28 : 22 }}>brandbid.wtf</div>
      </div>
    </div>
  );
}
