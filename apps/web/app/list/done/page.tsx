import { DoneStatus } from './DoneStatus';

export const metadata = { title: 'Your listing · brandbid' };

export default async function Done({ searchParams }: { searchParams: Promise<{ id?: string; t?: string }> }) {
  const { id, t } = await searchParams;
  return (
    <main className="mx-auto max-w-xl p-6">
      {id && t ? (
        <DoneStatus id={id} token={t} />
      ) : (
        <p>
          Nothing to show. <a className="underline" href="/list">List a brand</a>
        </p>
      )}
    </main>
  );
}
