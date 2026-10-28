'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import posthog from 'posthog-js';
import { ANALYTICS_CONSENT_KEY } from '@/lib/analytics';
import { safeStorageGet, safeStorageSet, shareText } from './share-utils';

type Links = { story: string; linkedin: string; x: string; link: string };
const GUIDE_KEY = 'bb_story_guide_seen';

export function ShareSheet({ brandName, logoPath = null, description, links, storyImageUrl, returnHref }: {
  brandName: string;
  logoPath?: string | null;
  description: string;
  links: Links;
  storyImageUrl: string;
  returnHref: string;
}) {
  const [draft, setDraft] = useState(`Check out ${brandName}: ${description} ${links.link} #ad`.replace(/\s+/g, ' ').trim());
  const [notice, setNotice] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  // The draft contains a generic link. Platform actions attach their own channel link separately,
  // so remove every known tracked URL from the caption before sharing it.
  const textForShare = () => shareText(draft, Object.values(links));
  const track = (channel: string) => {
    if (safeStorageGet(ANALYTICS_CONSENT_KEY) === 'yes') {
      posthog.capture('share_channel_tapped', { channel });
    }
  };
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  async function shareStory() {
    track('story');
    try {
      await copy(links.story);
      const response = await fetch(storyImageUrl);
      if (!response.ok) throw new Error('image_unavailable');
      const file = new File([await response.blob()], `${brandName.replace(/[^a-z0-9-_]/gi, '-')}-story.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], text: textForShare() });
      } else {
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
        setNotice('Story image downloaded and link copied. Add the link with Instagram’s Link sticker.');
      }
      if (safeStorageGet(GUIDE_KEY) !== 'yes') setShowGuide(true);
    } catch {
      setNotice('Could not prepare the story image. Your link is copied; try downloading the image again.');
    }
  }

  function shareX() {
    track('x');
    const href = `https://x.com/intent/post?text=${encodeURIComponent(textForShare())}&url=${encodeURIComponent(links.x)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function shareLinkedIn() {
    track('linkedin');
    void copy(textForShare()).then(() => setNotice('Post text copied. Paste it into your LinkedIn post.')).catch(() => setNotice('Could not copy the post text.'));
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(links.linkedin)}`, '_blank', 'noopener,noreferrer');
  }

  async function copyLink() {
    track('link');
    try {
      await copy(links.link);
      setNotice('Link copied.');
    } catch {
      setNotice('Could not copy the link.');
    }
  }

  const buttons = [
    ['Instagram story', 'Share or download a story card', shareStory],
    ['LinkedIn', 'Copy text and open LinkedIn', shareLinkedIn],
    ['X', 'Open a prefilled post', shareX],
    ['Copy link', 'Use anywhere you like', copyLink],
  ] as const;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fixed inset-0 z-40 flex items-end justify-center bg-[#5e5b52]/90 sm:items-center sm:p-4">
    <section className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-bg px-[18px] pb-[22px] pt-2.5 sm:rounded-[20px] sm:p-7" aria-labelledby="share-title">
      <div aria-hidden className="mx-auto h-1 w-10 rounded-sm bg-[#bdb8aa] sm:hidden" />
      <div className="flex items-center gap-3">
        <BrandLogo name={brandName} logoPath={logoPath} size={44} />
        <div className="flex-1">
          <div className="text-xs font-medium text-muted">Advertise</div>
          <h2 id="share-title" className="text-[22px] font-extrabold leading-[1.05]">{brandName}</h2>
        </div>
        <Link href={returnHref} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-lg text-fg hover:text-fg">×</Link>
      </div>
      <p className="rounded-[14px] bg-ink px-4 py-3.5 text-[13px] leading-snug text-[#d7d2c5]">Your channel links stay the same. The <b className="font-mono text-brand">#ad</b> disclosure is added when you share.</p>
      <div>
        <label className="font-mono text-[11px] uppercase text-muted" htmlFor="share-copy">Suggested post text</label>
        <textarea id="share-copy" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={500} className="mt-2 w-full resize-y rounded-xl border border-line bg-surface p-3.5 text-sm leading-normal" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {buttons.map(([label, hint, onClick]) => (
          <button key={label} type="button" onClick={onClick} className="rounded-xl border-[1.5px] border-fg bg-surface p-3 text-left text-sm font-semibold hover:bg-brand">
            {label}<span className="mt-1 block text-xs font-normal text-muted">{hint}</span>
          </button>
        ))}
      </div>
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    </section>
    {showGuide && <div role="dialog" aria-modal="true" aria-labelledby="story-guide-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"><div className="w-full max-w-sm space-y-4 rounded-t-3xl bg-bg p-6 sm:rounded-[20px]"><h3 id="story-guide-title" className="font-display text-lg font-bold">Finish your Instagram story</h3><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open Instagram and add the downloaded story image.</li><li>Add Instagram’s Link sticker.</li><li>Paste the copied Brandbid link, then share your story.</li></ol><button type="button" onClick={() => { safeStorageSet(GUIDE_KEY, 'yes'); setShowGuide(false); }} className="w-full rounded-full bg-brand px-4 py-3.5 font-semibold text-ink">Got it</button></div></div>}
    </div>
  );
}
