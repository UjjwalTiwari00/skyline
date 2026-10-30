import 'server-only';

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Enquiry, StoredEnquiry } from './enquiry';

/**
 * Enquiry persistence.
 *
 * One interface, one file-backed implementation. Swapping in Postgres means
 * writing a second object with the same two methods; no caller changes.
 *
 * Storage format is JSON Lines, not a JSON array: appending a line is atomic
 * enough for this workload, whereas rewriting a whole array on every submit
 * loses writes when two arrive at once.
 *
 * Serverless caveat, stated plainly: only /tmp is writable on Vercel and it is
 * per-instance and ephemeral, so enquiries written there do not outlive the
 * instance. That is acceptable for a demo and wrong for production — the
 * README says so and names the fix.
 */
export interface EnquiryStore {
  save(enquiry: Enquiry): Promise<StoredEnquiry>;
  list(): Promise<StoredEnquiry[]>;
}

function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // Vercel sets this; everywhere else we can write beside the project.
  if (process.env.VERCEL) return '/tmp/skyline';
  return join(process.cwd(), 'data');
}

class FileEnquiryStore implements EnquiryStore {
  private readonly file = join(resolveDataDir(), 'enquiries.jsonl');

  async save(enquiry: Enquiry): Promise<StoredEnquiry> {
    // The honeypot is a transport concern, not data worth keeping.
    const { company: _ignored, ...rest } = enquiry;
    const stored: StoredEnquiry = {
      ...rest,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(stored)}\n`, 'utf8');
    return stored;
  }

  async list(): Promise<StoredEnquiry[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      // No file yet means no enquiries, which is not an error state.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    return raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as StoredEnquiry];
        } catch {
          // One corrupt line must not take down the admin page.
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const enquiryStore: EnquiryStore = new FileEnquiryStore();
