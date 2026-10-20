import type { Metadata } from 'next';
import { CompareLab } from '@/components/compare/CompareLab';
import { DetailHeader } from '@/components/explorer/DetailHeader';

export const metadata: Metadata = {
  title: 'Sorting race and complexity playground | Algorender',
  description:
    'Race sorting algorithms on the same input, then watch how their work grows with n against the n² and n log n curves.',
};

export default function ComparePage() {
  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-6 md:px-0 md:pt-1">
      <DetailHeader
        crumb="Lab"
        back="/explore"
        title="Race the sorts"
        description="Same input, same rules, side by side. Then see how the gap grows as the input does: Big-O is a claim about how work grows, and here you can test it."
      />
      <CompareLab />
    </main>
  );
}
