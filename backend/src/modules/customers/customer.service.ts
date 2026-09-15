import { execute, query } from '../../database/db.js';
import { Customer, CustomerAddress } from '../../shared/types.js';
import { v4 as uuidv4 } from 'uuid';

export interface AddressResolution {
  address: CustomerAddress | null;
  ambiguous: boolean;
  candidates: CustomerAddress[];
}

export interface AddressDraftCaptureResult {
  draftId: number;
  status: 'serviceable' | 'unvalidated' | 'unserviceable';
  address?: CustomerAddress;
  area?: string | null;
  safeSummary: string;
}

/**
 * Normalize a saved-address selection without turning an arbitrary phrase into
 * a match. Address labels are customer-owned identifiers, so asking again is
 * always safer than silently selecting a default address.
 */
function normalizeAddressPhrase(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u200c\u200d]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HOME_SELECTION_PHRASES = new Set([
  'home', 'my home', 'at home', 'the home',
  'bet', 'beit', 'bayt', '3al bet', '3albet', '3al beit', '3albeit', '3al bayt', '3albayt',
  '3a bet', '3a l bet', 'same address', 'nefs el 3enwen',
  'البيت', 'ع البيت', 'عالبيت', 'على البيت', 'بالبيت',
].map(normalizeAddressPhrase));
// Keep the source-script forms explicit; normalization also handles Arabizi.
for (const phrase of ['البيت', 'ع البيت', 'عالبيت', 'على البيت', 'بالبيت']) {
  HOME_SELECTION_PHRASES.add(normalizeAddressPhrase(phrase));
}

const WORK_SELECTION_PHRASES = new Set([
  'work', 'my work', 'office', 'my office',
  'maktab', 'el maktab', '3al maktab', '3almaktab', '3a maktab',
  'shoghol', 'shoghl', 'el shoghol', '3al shoghol', '3alshoghol',
  'الشغل', 'ع الشغل', 'عالشغل', 'بالشغل', 'المكتب', 'ع المكتب', 'عالمكتب', 'بالمكتب',
].map(normalizeAddressPhrase));

export class CustomerService {
  async findByPhone(whatsappNumber: string): Promise<Customer | null> {
    const cleanPhone = whatsappNumber.replace(/[^0-9]/g, '');
    const existing = await query<Customer[]>(`
      SELECT * FROM customers WHERE whatsapp_number = ? LIMIT 1
    `, [cleanPhone]);
    return existing.length > 0 ? existing[0] : null;
  }

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

    const normalized = normalizeAddressPhrase(phrase);
    if (!normalized) return { address: null, ambiguous: false, candidates: [] };
    const matchingLabel = (label: string) => addresses.filter((addr) => normalizeAddressPhrase(addr.label) === normalizeAddressPhrase(label));
    const matchingDetails = addresses.filter((addr) => {
      const details = [addr.area_name, addr.landmark, addr.formatted_address, addr.building]
        .filter(Boolean)
        .join(' ');
      const normalizedDetails = normalizeAddressPhrase(details);
      return normalized.length >= 3 && normalizedDetails.includes(normalized);
    });

    const direct = addresses.filter((addr) => normalizeAddressPhrase(addr.label) === normalized);
    if (direct.length > 0) {
      return direct.length === 1
        ? { address: direct[0], ambiguous: false, candidates: direct }
        : { address: null, ambiguous: true, candidates: direct };
    }

    const homePhrases = ['home', '3al bet', '3albet', 'al bet', 'albet', 'bet', 'bayt', 'Ø¨ÙŠØª', 'Ø¹ Ø§Ù„Ø¨ÙŠØª', 'Ø¹Ø§Ù„Ø¨ÙŠØª', 'same address', 'nefs el 3enwen', 'Ø§Ù„Ø¨ÙŠØª'];
    if (HOME_SELECTION_PHRASES.has(normalized)) {
      const homes = matchingLabel('home');
      return homes.length === 1
        ? { address: homes[0], ambiguous: false, candidates: homes }
        : homes.length > 1
          ? { address: null, ambiguous: true, candidates: homes }
          : { address: null, ambiguous: false, candidates: [] };
    }

    const workPhrases = ['work', 'office', 'maktab', 'shoghol', 'shoghl', 'Ø´ØºÙ„', 'Ù…ÙƒØªØ¨', 'Ø¹ Ø§Ù„Ø´ØºÙ„', 'Ø¹Ø§Ù„Ù…ÙƒØªØ¨'];
    if (WORK_SELECTION_PHRASES.has(normalized)) {
      const work = matchingLabel('work');
      return work.length === 1
        ? { address: work[0], ambiguous: false, candidates: work }
        : work.length > 1
          ? { address: null, ambiguous: true, candidates: work }
          : { address: null, ambiguous: false, candidates: [] };
    }

    if (matchingDetails.length === 1) {
      return { address: matchingDetails[0], ambiguous: false, candidates: matchingDetails };
    }
    if (matchingDetails.length > 1) {
      return { address: null, ambiguous: true, candidates: matchingDetails };
    }

    // An unmatched phrase must remain a true miss. Selecting a default address
    // here could create an order for a destination the customer never chose.
    return { address: null, ambiguous: false, candidates: [] };
  }

  /**
   * Store a delivery address draft outside Gemini state. The returned summary
   * intentionally contains only a minimal area/status cue; full directions
   * are available to fulfillment but are never put into the AI prompt.
   */
  async captureDeliveryAddressDraft(
    customerId: number,
    conversationId: number,
    rawAddress: string,
    inboundMessageId?: number | null,
  ): Promise<AddressDraftCaptureResult> {
    const value = String(rawAddress || '').trim().slice(0, 1000);
    const normalized = normalizeAddressPhrase(value);
    const hasUsableDetail = normalized.length >= 12;
    const serviceable = /\b(saida|sidon|abra)\b|صيدا|عبرا|\blat\b.*\blng\b/u.test(value.toLocaleLowerCase());
    const hasArabicServiceArea = /صيدا|عبرا/u.test(value);
    const status: AddressDraftCaptureResult['status'] = !hasUsableDetail
      ? 'unvalidated'
      : serviceable || hasArabicServiceArea
        ? 'serviceable'
        : 'unserviceable';
    const area = /abra|عبرا/i.test(value) ? 'Abra' : /saida|sidon|صيدا/i.test(value) ? 'Saida' : null;
    const safeSummary = area ? `${area} delivery address` : 'Delivery address draft';
    const draftResult: any = await execute(
      `INSERT INTO conversation_address_drafts
       (public_id, conversation_id, inbound_message_id, raw_address, safe_summary, area_name, validation_status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL 24 HOUR)`,
      [uuidv4(), conversationId, inboundMessageId || null, value, safeSummary, area, status.toUpperCase()],
    );
    const draftId = Number(draftResult.insertId);
    if (status !== 'serviceable') return { draftId, status, area, safeSummary };

    // A fulfillment-only address is created for this checkout. It is not a
    // default and receives no saved label unless the customer later consents.
    const addressResult: any = await execute(
      `INSERT INTO customer_addresses
       (public_id, customer_id, label, formatted_address, area_name, is_default, status)
       VALUES (?, ?, 'Delivery address', ?, ?, 0, 'ACTIVE')`,
      [uuidv4(), customerId, value, area],
    );
    const addressRows = await query<CustomerAddress[]>(`SELECT * FROM customer_addresses WHERE id = ? LIMIT 1`, [addressResult.insertId]);
    return { draftId, status, address: addressRows[0], area, safeSummary };
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
