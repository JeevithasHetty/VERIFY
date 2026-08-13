import { customAlphabet } from 'nanoid';

// Uppercase alphanumeric, unambiguous-ish alphabet for processing IDs.
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const generate = customAlphabet(alphabet, 8);

/**
 * Generates a unique processing ID, e.g. fv_8A92K1D3
 */
export function generateProcessingId() {
  return `fv_${generate()}`;
}

export default generateProcessingId;
