'use client';

import { useState } from 'react';
import Link from 'next/link';
import posthog from 'posthog-js';
import { ANALYTICS_CONSENT_KEY } from '@/lib/analytics';
import { safeStorageGet, safeStorageSet, shareText } from './share-utils';

type Links = { story: string; linkedin: string; x: string; link: string };
const GUIDE_KEY = 'bb_story_guide_seen';

export function ShareSheet({ brandName, description, links, storyImageUrl, returnHref }: {
  brandName: string;
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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
    <section className="max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-card sm:rounded-2xl" aria-labelledby="share-title">
      <div>
        <div className="flex items-start justify-between gap-3"><h2 id="share-title" className="text-xl font-bold">Share {brandName}</h2><Link href={returnHref} className="rounded-lg border border-line px-3 py-1 text-sm">Close</Link></div>
        <p className="mt-1 text-sm text-muted">Your channel links stay the same. The #ad disclosure is added when you share.</p>
      </div>
      <label className="block text-sm font-medium" htmlFor="share-copy">Suggested post text</label>
      <textarea id="share-copy" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={500} className="w-full resize-y rounded-lg border border-line bg-bg p-3 text-sm" />
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={shareStory} className="rounded-lg border border-line p-3 text-left font-semibold hover:bg-bg">Instagram story<span className="mt-1 block text-xs font-normal text-muted">Share or download a story card</span></button>
        <button type="button" onClick={shareLinkedIn} className="rounded-lg border border-line p-3 text-left font-semibold hover:bg-bg">LinkedIn<span className="mt-1 block text-xs font-normal text-muted">Copy text and open LinkedIn</span></button>
        <button type="button" onClick={shareX} className="rounded-lg border border-line p-3 text-left font-semibold hover:bg-bg">X<span className="mt-1 block text-xs font-normal text-muted">Open a prefilled post</span></button>
        <button type="button" onClick={copyLink} className="rounded-lg border border-line p-3 text-left font-semibold hover:bg-bg">Copy link<span className="mt-1 block text-xs font-normal text-muted">Use anywhere you like</span></button>
      </div>
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
    </section>
    {showGuide && <div role="dialog" aria-modal="true" aria-labelledby="story-guide-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"><div className="w-full max-w-sm space-y-4 rounded-t-2xl border border-line bg-surface p-6 sm:rounded-2xl"><h3 id="story-guide-title" className="text-lg font-bold">Finish your Instagram story</h3><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open Instagram and add the downloaded story image.</li><li>Add Instagram’s Link sticker.</li><li>Paste the copied Brandbid link, then share your story.</li></ol><button type="button" onClick={() => { safeStorageSet(GUIDE_KEY, 'yes'); setShowGuide(false); }} className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg">Got it</button></div></div>}
    </div>
  );
}
