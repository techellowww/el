import type { Proposal, ProposalStatus } from '@/types';

export type { Proposal, ProposalStatus };

export async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch('/api/proposals');
  const data = await res.json();
  return data.proposals || data;
}

