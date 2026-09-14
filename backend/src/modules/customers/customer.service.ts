import { query } from '../../database/db.js';
import { Customer, CustomerAddress } from '../../shared/types.js';
import { v4 as uuidv4 } from 'uuid';

export interface AddressResolution {
  address: CustomerAddress | null;
  ambiguous: boolean;
  candidates: CustomerAddress[];
}

export class CustomerService {
  async findOrCreateByPhone(whatsappNumber: string, displayName?: string): Promise<Customer> {
    const cleanPhone = whatsappNumber.replace(/[^0-9]/g, '');

    const existing = await query<Customer[]>(`
      SELECT * FROM customers WHERE whatsapp_number = ? LIMIT 1
    `, [cleanPhone]);

    if (existing.length > 0) {
      if (displayName && !existing[0].display_name) {
        await query(`UPDATE customers SET display_name = ? WHERE id = ?`, [displayName, existing[0].id]);
        existing[0].display_name = displayName;
      }
      return existing[0];
    }

    const publicId = uuidv4();
    await query(`
      INSERT INTO customers (public_id, whatsapp_number, display_name, preferred_language, status)
      VALUES (?, ?, ?, 'ar', 'ACTIVE')
    `, [publicId, cleanPhone, displayName || 'New Customer']);

    const created = await query<Customer[]>(`
      SELECT * FROM customers WHERE public_id = ? LIMIT 1
    `, [publicId]);

    return created[0];
  }

  async getCustomerAddresses(customerId: number): Promise<CustomerAddress[]> {
    return query<CustomerAddress[]>(`
      SELECT * FROM customer_addresses
      WHERE customer_id = ? AND status = 'ACTIVE'
      ORDER BY is_default DESC, created_at DESC
    `, [customerId]);
  }

  /**
   * Backwards-compatible single-address resolver. It deliberately returns
   * null when a phrase matches multiple addresses instead of guessing.
   */
  async resolveAddressByPhrase(customerId: number, phrase: string): Promise<CustomerAddress | null> {
    const resolution = await this.resolveAddressCandidates(customerId, phrase);
    return resolution.ambiguous ? null : resolution.address;
  }

  /** Resolve an address while preserving duplicate-label candidates for NLU. */
  async resolveAddressCandidates(customerId: number, phrase: string): Promise<AddressResolution> {
    const addresses = await this.getCustomerAddresses(customerId);
    if (addresses.length === 0) return { address: null, ambiguous: false, candidates: [] };

    const normalized = phrase.toLowerCase().trim();
    const matchingLabel = (label: string) => addresses.filter((addr) => addr.label.toLowerCase() === label);
    const matchingDetails = addresses.filter((addr) => {
      const details = [addr.area_name, addr.landmark, addr.formatted_address, addr.building]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return details.includes(normalized);
    });

    const direct = addresses.filter((addr) => {
      const label = addr.label.toLowerCase();
      return normalized.includes(label) || label.includes(normalized);
    });
    if (direct.length > 0) {
      return direct.length === 1
        ? { address: direct[0], ambiguous: false, candidates: direct }
        : { address: null, ambiguous: true, candidates: direct };
    }

    const homePhrases = ['home', '3al bet', '3albet', 'al bet', 'albet', 'bet', 'bayt', 'Ø¨ÙŠØª', 'Ø¹ Ø§Ù„Ø¨ÙŠØª', 'Ø¹Ø§Ù„Ø¨ÙŠØª', 'same address', 'nefs el 3enwen', 'Ø§Ù„Ø¨ÙŠØª'];
    if (homePhrases.some((p) => normalized.includes(p))) {
      const homes = matchingLabel('home');
      return homes.length === 1
        ? { address: homes[0], ambiguous: false, candidates: homes }
        : homes.length > 1
          ? { address: null, ambiguous: true, candidates: homes }
          : { address: addresses.find((a) => a.is_default) || addresses[0], ambiguous: false, candidates: [] };
    }

    const workPhrases = ['work', 'office', 'maktab', 'shoghol', 'shoghl', 'Ø´ØºÙ„', 'Ù…ÙƒØªØ¨', 'Ø¹ Ø§Ù„Ø´ØºÙ„', 'Ø¹Ø§Ù„Ù…ÙƒØªØ¨'];
    if (workPhrases.some((p) => normalized.includes(p))) {
      const work = matchingLabel('work');
      return work.length === 1
        ? { address: work[0], ambiguous: false, candidates: work }
        : work.length > 1
          ? { address: null, ambiguous: true, candidates: work }
          : { address: addresses.find((a) => a.is_default) || addresses[0], ambiguous: false, candidates: [] };
    }

    if (matchingDetails.length === 1) {
      return { address: matchingDetails[0], ambiguous: false, candidates: matchingDetails };
    }
    if (matchingDetails.length > 1) {
      return { address: null, ambiguous: true, candidates: matchingDetails };
    }

    return { address: addresses.find((a) => a.is_default) || addresses[0], ambiguous: false, candidates: [] };
  }

  async getAllCustomers(): Promise<any[]> {
    return query<any[]>(`
      SELECT c.*, ca.label as default_address_label, ca.formatted_address
      FROM customers c
      LEFT JOIN customer_addresses ca ON ca.id = c.default_address_id
      ORDER BY c.created_at DESC
    `);
  }
}

export const customerService = new CustomerService();
