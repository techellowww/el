import type { Client } from '@/types';

export type { Client };

export async function fetchClients(): Promise<Client[]> {
  const res = await fetch('/api/clients');
  const data = await res.json();
  return data.clients || data;
}

export async function fetchClientById(id: string): Promise<Client> {
  const res = await fetch(`/api/clients/${id}`);
  return res.json();
}

