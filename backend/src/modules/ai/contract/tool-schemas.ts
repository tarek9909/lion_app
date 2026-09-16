import { z } from 'zod';

export type ToolType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export interface ToolFieldSpec {
  type: ToolType;
  description: string;
  required?: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  items?: ToolFieldSpec;
  properties?: Record<string, ToolFieldSpec>;
}

export interface ToolDefinitionSpec {
  name: string;
  description: string;
  parameters: Record<string, ToolFieldSpec>;
  aliases?: string[];
  refinement?: {
    check: (data: any) => boolean;
    message: string;
  };
  transform?: (data: any) => any;
}

/**
 * Single Canonical Source of Truth for all Lion Delivery AI Tool Specifications.
 * Both Zod runtime validation schemas and Gemini FunctionDeclarations are programmatically
 * generated from this authoritative specification to guarantee structural and semantic equivalence.
 */
export const CANONICAL_TOOL_SPECS: Record<string, ToolDefinitionSpec> = {
  search_catalog: {
    name: 'search_catalog',
    description: 'Search restaurant and supermarket products in Saida by keyword, budget, and ranking preference.',
    parameters: {
      query: {
        type: 'STRING',
        description: 'Product or category query e.g. "crispy chicken", "coke zero", "burger", "halawet el jibn".',
        required: true,
        min: 1,
        max: 500,
      },
      max_budget: {
        type: 'NUMBER',
        description: 'Optional maximum price ceiling in USD e.g. 15.',
        required: false,
        min: 0.1,
      },
      preference: {
        type: 'STRING',
        description: 'Optional ranking: "cheapest", "best_rated", "fastest", or "best_value".',
        required: false,
        enum: ['cheapest', 'best_rated', 'fastest', 'best_value'],
      },
    },
  },

  list_category_options: {
    name: 'list_category_options',
    description: 'Show verified options in a category from the current cart merchant or another explicitly selected merchant context. Use this for natural requests such as adding a drink, dessert, or side.',
    parameters: {
      category: {
        type: 'STRING',
        description: 'Requested product category, for example beverage, dessert, side, burger, or crispy chicken.',
        required: true,
        min: 1,
        max: 80,
      },
      scope: {
        type: 'STRING',
        description: 'Use current_cart_merchant when modifying an existing cart. The server resolves the merchant from verified state.',
        required: false,
        enum: ['current_cart_merchant', 'selected_merchant'],
      },
    },
  },

  resolve_product_name: {
    name: 'resolve_product_name',
    description: 'Resolve a short product follow-up using verified aliases, spelling candidates, and the current merchant menu. Never substitutes an unavailable product.',
    parameters: {
      product_name: {
        type: 'STRING',
        description: 'The product or drink name supplied by the customer.',
        required: true,
        min: 1,
        max: 200,
      },
      category: {
        type: 'STRING',
        description: 'Pending category context such as beverage when known.',
        required: false,
        max: 80,
      },
      merchant_branch_id: {
        type: 'INTEGER',
        description: 'Verified current merchant branch ID when modifying an existing cart.',
        required: false,
        min: 1,
      },
    },
  },

  compare_supermarket_basket: {
    name: 'compare_supermarket_basket',
    description: 'Compare a multi-item grocery shopping basket across Saida supermarkets to find the best total price.',
    parameters: {
      items: {
        type: 'ARRAY',
        description: 'List of supermarket items and quantities.',
        required: true,
        min: 1,
        max: 30,
        items: {
          type: 'OBJECT',
          description: 'Single basket item request.',
          required: true,
          properties: {
            query: {
              type: 'STRING',
              description: 'Item name e.g. "coke zero", "milk", "bread".',
              required: true,
              min: 1,
              max: 200,
            },
            quantity: {
              type: 'INTEGER',
              description: 'Quantity requested (must be a positive whole number).',
              required: true,
              min: 1,
              max: 99,
            },
          },
        },
      },
    },
  },

  get_active_cart: {
    name: 'get_active_cart',
    description: 'Retrieve the customer active cart items, subtotal, delivery fee, and estimated total.',
    parameters: {},
  },

  add_to_cart: {
    name: 'add_to_cart',
    description: 'Add a product from the catalog to the customer cart.',
    parameters: {
      merchant_product_id: {
        type: 'INTEGER',
        description: 'Specific merchant product ID from previous search results.',
        required: false,
        min: 1,
      },
      product_name_query: {
        type: 'STRING',
        description: 'Product name to add if ID is unknown.',
        required: false,
        max: 200,
      },
      option_index: {
        type: 'INTEGER',
        description: '1-based index from the last presented options.',
        required: false,
        min: 1,
        max: 50,
      },
      quantity: {
        type: 'INTEGER',
        description: 'Quantity of items to add. Defaults to 1 if not specified in add action.',
        required: false,
        min: 1,
        max: 99,
      },
      customer_notes: {
        type: 'STRING',
        description: 'Optional preparation instructions (e.g. "no pickles", "extra garlic").',
        required: false,
        max: 500,
      },
      variant_name: {
        type: 'STRING',
        description: 'Selected variant (e.g. "Large", "Spicy", "Meal").',
        required: false,
        max: 100,
      },
    },
    refinement: {
      check: (d) => d.merchant_product_id !== undefined || d.product_name_query !== undefined || d.option_index !== undefined,
      message: 'At least one of merchant_product_id, product_name_query, or option_index must be provided',
    },
  },

  update_cart_quantity: {
    name: 'update_cart_quantity',
    description: 'Update the quantity of an item already in the cart. Set to 0 to remove. Explicit quantity required.',
    parameters: {
      target_item: {
        type: 'STRING',
        description: 'Name or description of the cart item to update.',
        required: true,
        min: 1,
        max: 200,
      },
      new_quantity: {
        type: 'INTEGER',
        description: 'New desired item quantity (0 to 99). Setting 0 removes the item.',
        required: false,
        min: 0,
        max: 99,
      },
      quantity: {
        type: 'INTEGER',
        description: 'Alias for new_quantity.',
        required: false,
        min: 0,
        max: 99,
      },
    },
    refinement: {
      check: (d) => d.new_quantity !== undefined || d.quantity !== undefined,
      message: 'Explicit new_quantity is required for quantity update (must not default to 1)',
    },
    transform: (data) => ({
      target_item: data.target_item,
      new_quantity: data.new_quantity !== undefined ? data.new_quantity : data.quantity,
    }),
  },

  update_cart_variant: {
    name: 'update_cart_variant',
    description: 'Update the variant option (e.g. size, flavor) for an existing cart item.',
    parameters: {
      target_item: {
        type: 'STRING',
        description: 'Name of the cart item to modify.',
        required: true,
        min: 1,
        max: 200,
      },
      variant_name: {
        type: 'STRING',
        description: 'Name of the replacement variant (e.g. "Large", "Diet", "Spicy").',
        required: true,
        min: 1,
        max: 100,
      },
    },
  },

  update_cart_notes: {
    name: 'update_cart_notes',
    description: 'Update preparation notes for an existing item in the cart. Explicit notes required.',
    parameters: {
      target_item: {
        type: 'STRING',
        description: 'Name of the cart item to modify.',
        required: true,
        min: 1,
        max: 200,
      },
      notes: {
        type: 'STRING',
        description: 'Updated preparation notes (e.g. "no onions, extra sauce").',
        required: false,
        min: 1,
        max: 500,
      },
      customer_notes: {
        type: 'STRING',
        description: 'Alias for notes.',
        required: false,
        min: 1,
        max: 500,
      },
    },
    refinement: {
      check: (d) => Boolean((d.notes && d.notes.trim()) || (d.customer_notes && d.customer_notes.trim())),
      message: 'Explicit notes are required when updating cart notes (cannot default to empty)',
    },
    transform: (data) => ({
      target_item: data.target_item,
      notes: (data.notes || data.customer_notes || '').trim(),
    }),
  },

  remove_cart_item: {
    name: 'remove_cart_item',
    description: 'Remove an item completely from the cart.',
    parameters: {
      target_item: {
        type: 'STRING',
        description: 'Name or description of the item to remove from the cart.',
        required: true,
        min: 1,
        max: 200,
      },
    },
  },

  clear_cart: {
    name: 'clear_cart',
    description: 'Remove all items and completely reset the current shopping cart. Explicit confirmation required.',
    parameters: {
      confirmation: {
        type: 'BOOLEAN',
        description: 'Explicit confirmation flag to clear cart.',
        required: true,
      },
    },
  },

  list_saved_addresses: {
    name: 'list_saved_addresses',
    description: 'List the customer saved delivery addresses (e.g. Home, Work, Parents).',
    aliases: ['get_customer_addresses'],
    parameters: {},
  },

  select_delivery_address: {
    name: 'select_delivery_address',
    description: 'Select a saved address for checkout delivery (e.g. "Home", "Work", "3al Bet"). Explicit label required.',
    parameters: {
      address_label: {
        type: 'STRING',
        description: 'Saved address label to select (e.g. "Home", "Work").',
        required: false,
        min: 1,
        max: 100,
      },
      phrase_or_label: {
        type: 'STRING',
        description: 'Alias for address_label.',
        required: false,
        min: 1,
        max: 100,
      },
    },
    refinement: {
      check: (d) => Boolean((d.address_label && d.address_label.trim()) || (d.phrase_or_label && d.phrase_or_label.trim())),
      message: 'Explicit address_label is required when selecting delivery address (cannot default to empty)',
    },
    transform: (data) => ({
      address_label: (data.address_label || data.phrase_or_label || '').trim(),
    }),
  },

  capture_delivery_address: {
    name: 'capture_delivery_address',
    description: 'Capture and validate a free-text delivery address or location pin while an address is expected. This never searches the catalog and never creates an order.',
    parameters: {
      raw_address: {
        type: 'STRING',
        description: 'Customer-provided address, landmark, directions, or location pin text.',
        required: true,
        min: 3,
        max: 1000,
      },
      save_label: {
        type: 'STRING',
        description: 'Optional customer-provided saved-address label after consent, such as Home or Work.',
        required: false,
        max: 80,
      },
    },
  },

  rename_delivery_address: {
    name: 'rename_delivery_address',
    description: 'Rename the currently selected customer delivery address after the customer explicitly asks to save or rename it, for example as Home or Work.',
    parameters: {
      address_label: {
        type: 'STRING',
        description: 'Explicit customer-provided label such as Home or Work.',
        required: true,
        min: 1,
        max: 80,
      },
    },
  },

  confirm_and_create_order: {
    name: 'confirm_and_create_order',
    description: 'Place the order after final summary review and explicit customer confirmation. Idempotent.',
    parameters: {
      confirmation_phrase: {
        type: 'STRING',
        description: 'Explicit customer confirmation phrase (e.g. "confirm", "akid", "yes confirm").',
        required: true,
        min: 1,
        max: 100,
      },
      notes: {
        type: 'STRING',
        description: 'Optional final delivery instructions.',
        required: false,
        max: 500,
      },
      customer_notes: {
        type: 'STRING',
        description: 'Alias for delivery notes.',
        required: false,
        max: 500,
      },
    },
    transform: (data) => ({
      confirmation_phrase: data.confirmation_phrase.trim(),
      notes: (data.notes || data.customer_notes || '').trim() || undefined,
    }),
  },

  create_multi_order_plan: {
    name: 'create_multi_order_plan',
    description: 'Create a reviewable batch of separate merchant orders. Preserve every selected merchant cart and do not clear or switch either one.',
    parameters: {
      items: {
        type: 'ARRAY',
        description: 'Optional additional verified products to include in independent merchant child carts.',
        required: false,
        max: 20,
        items: {
          type: 'OBJECT',
          description: 'A verified merchant product selection.',
          required: true,
          properties: {
            merchant_product_id: {
              type: 'INTEGER',
              description: 'Verified merchant product ID from a catalog result.',
              required: true,
              min: 1,
            },
            quantity: {
              type: 'INTEGER',
              description: 'Requested quantity.',
              required: false,
              min: 1,
              max: 99,
            },
          },
        },
      },
      selection_source: {
        type: 'STRING',
        description: 'Use last_presented_options when the customer selects recommendations already shown in this conversation. The server resolves safe indexes to verified products.',
        required: false,
        enum: ['last_presented_options'],
      },
      selected_option_indexes: {
        type: 'ARRAY',
        description: 'One-based indexes of previously shown product recommendations. Never supply database IDs for this mode.',
        required: false,
        min: 2,
        max: 20,
        items: {
          type: 'INTEGER',
          description: 'One-based previously shown option index.',
          required: true,
          min: 1,
          max: 20,
        },
      },
      same_address: {
        type: 'BOOLEAN',
        description: 'Whether the customer explicitly wants the same delivery address for both orders when already known.',
        required: false,
      },
    },
  },

  review_multi_order_plan: {
    name: 'review_multi_order_plan',
    description: 'Return separate verified summaries, delivery fees, and totals for each child order in the pending batch.',
    parameters: {},
  },

  set_batch_delivery_address: {
    name: 'set_batch_delivery_address',
    description: 'Apply one selected saved delivery address to every pending order in the batch and show fresh separate summaries. Explicit address required.',
    parameters: {
      address_label: {
        type: 'STRING',
        description: 'Saved address label selected by the customer.',
        required: true,
        min: 1,
        max: 100,
      },
    },
  },

  confirm_order_batch: {
    name: 'confirm_order_batch',
    description: 'Place one or both reviewed child orders only after the customer explicitly says confirm 1, confirm 2, or confirm both.',
    parameters: {
      confirmation_phrase: {
        type: 'STRING',
        description: 'Exact customer confirmation phrase.',
        required: true,
        min: 1,
        max: 100,
      },
      selection: {
        type: 'STRING',
        description: 'Child order selection: 1, 2, or both.',
        required: false,
        enum: ['1', '2', 'both'],
      },
    },
  },

  cancel_order_batch_child: {
    name: 'cancel_order_batch_child',
    description: 'Decline one child order before placement while preserving the other child cart.',
    parameters: {
      child_index: {
        type: 'INTEGER',
        description: 'The one-based child order number to cancel.',
        required: true,
        min: 1,
        max: 20,
      },
    },
  },

  get_order_status: {
    name: 'get_order_status',
    description: 'Check the status, ETA, and live tracking of an active or recent order.',
    parameters: {
      order_id: {
        type: 'INTEGER',
        description: 'Internal order ID if known.',
        required: false,
        min: 1,
      },
      order_number: {
        type: 'STRING',
        description: 'Human-readable order tracking number (e.g. "LION-20260915-001").',
        required: false,
        max: 100,
      },
    },
  },

  request_human_support: {
    name: 'request_human_support',
    description: 'Transfer the customer conversation to a live human operations agent.',
    parameters: {
      reason: {
        type: 'STRING',
        description: 'Reason for human escalation.',
        required: true,
        min: 1,
        max: 500,
      },
    },
  },

  switch_merchant_confirm: {
    name: 'switch_merchant_confirm',
    description: 'Confirm switching to a new merchant and clearing the previous cart. Explicit approval required.',
    parameters: {
      confirm_switch: {
        type: 'BOOLEAN',
        description: 'Explicit confirmation flag. Must be strictly true to confirm merchant switch.',
        required: true,
      },
      confirmation_phrase: {
        type: 'STRING',
        description: 'Explicit confirmation phrase from customer.',
        required: true,
        min: 1,
        max: 100,
      },
    },
  },

  switch_merchant_reject: {
    name: 'switch_merchant_reject',
    description: 'Decline switching to the new merchant, keeping the existing cart intact.',
    parameters: {
      reject_switch: {
        type: 'BOOLEAN',
        description: 'Explicit rejection flag. Must be strictly true to decline merchant switch.',
        required: true,
      },
    },
  },
};

/**
 * Convert a ToolFieldSpec into a Zod schema
 */
function fieldToZod(field: ToolFieldSpec): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'STRING': {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      if (field.enum && field.enum.length > 0) {
        schema = z.enum(field.enum as [string, ...string[]]);
      } else {
        schema = s;
      }
      break;
    }
    case 'INTEGER': {
      let n = z.number().int({ message: 'Quantity must be a whole-number integer' });
      if (field.min !== undefined) {
        const minMsg = field.min >= 1 ? 'Quantity must be a positive whole number' : undefined;
        n = minMsg ? n.min(field.min, { message: minMsg }) : n.min(field.min);
      }
      if (field.max !== undefined) n = n.max(field.max);
      schema = n;
      break;
    }
    case 'NUMBER': {
      let n = z.number();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      schema = n;
      break;
    }
    case 'BOOLEAN':
      schema = z.boolean();
      break;
    case 'ARRAY': {
      if (!field.items) throw new Error('ARRAY field must specify items');
      let a = z.array(fieldToZod(field.items));
      if (field.min !== undefined) a = a.min(field.min);
      if (field.max !== undefined) a = a.max(field.max);
      schema = a;
      break;
    }
    case 'OBJECT': {
      const props: Record<string, z.ZodTypeAny> = {};
      if (field.properties) {
        for (const [key, propSpec] of Object.entries(field.properties)) {
          props[key] = fieldToZod(propSpec);
        }
      }
      schema = z.object(props).strict();
      break;
    }
    default:
      schema = z.any();
  }

  if (!field.required) {
    schema = schema.optional();
  }

  return schema;
}

/**
 * Programmatically build a runtime Zod validation schema from a ToolDefinitionSpec
 */
export function buildZodSchema(spec: ToolDefinitionSpec): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(spec.parameters)) {
    shape[key] = fieldToZod(field);
  }

  let obj = z.object(shape).strict();
  let result: z.ZodTypeAny = obj;

  if (spec.refinement) {
    result = result.refine(spec.refinement.check, { message: spec.refinement.message });
  }

  if (spec.transform) {
    result = result.transform(spec.transform);
  }

  return result;
}

/**
 * Programmatically generate a Gemini function declaration from a ToolDefinitionSpec
 */
function fieldToGeminiProperty(field: ToolFieldSpec): any {
  const prop: any = {
    type: field.type,
    description: field.description,
  };

  if (field.enum && field.enum.length > 0) {
    prop.enum = field.enum;
  }

  if (field.type === 'STRING') {
    if (field.min !== undefined) prop.minLength = field.min;
    if (field.max !== undefined) prop.maxLength = field.max;
  } else if (field.type === 'NUMBER' || field.type === 'INTEGER') {
    if (field.min !== undefined) prop.minimum = field.min;
    if (field.max !== undefined) prop.maximum = field.max;
  } else if (field.type === 'ARRAY') {
    if (field.min !== undefined) prop.minItems = field.min;
    if (field.max !== undefined) prop.maxItems = field.max;
  }

  if (field.type === 'ARRAY' && field.items) {
    prop.items = fieldToGeminiProperty(field.items);
  }

  if (field.type === 'OBJECT' && field.properties) {
    prop.properties = {};
    const req: string[] = [];
    for (const [k, p] of Object.entries(field.properties)) {
      prop.properties[k] = fieldToGeminiProperty(p);
      if (p.required) req.push(k);
    }
    if (req.length > 0) prop.required = req;
  }

  return prop;
}

export function buildGeminiDeclaration(spec: ToolDefinitionSpec): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(spec.parameters)) {
    properties[key] = fieldToGeminiProperty(field);
    if (field.required) {
      required.push(key);
    }
  }

  const decl: any = {
    name: spec.name,
    description: spec.refinement
      ? `${spec.description} Constraint: ${spec.refinement.message}.`
      : spec.description,
    parameters: {
      type: 'OBJECT',
      properties,
    },
  };

  if (required.length > 0) {
    decl.parameters.required = required;
  }

  return decl;
}

// Concrete generated Zod schemas
export const SearchCatalogSchema = buildZodSchema(CANONICAL_TOOL_SPECS.search_catalog);
export const ListCategoryOptionsSchema = buildZodSchema(CANONICAL_TOOL_SPECS.list_category_options);
export const ResolveProductNameSchema = buildZodSchema(CANONICAL_TOOL_SPECS.resolve_product_name);
export const CompareSupermarketBasketSchema = buildZodSchema(CANONICAL_TOOL_SPECS.compare_supermarket_basket);
export const GetActiveCartSchema = buildZodSchema(CANONICAL_TOOL_SPECS.get_active_cart);
export const AddToCartSchema = buildZodSchema(CANONICAL_TOOL_SPECS.add_to_cart);
export const UpdateCartQuantitySchema = buildZodSchema(CANONICAL_TOOL_SPECS.update_cart_quantity);
export const UpdateCartVariantSchema = buildZodSchema(CANONICAL_TOOL_SPECS.update_cart_variant);
export const UpdateCartNotesSchema = buildZodSchema(CANONICAL_TOOL_SPECS.update_cart_notes);
export const RemoveCartItemSchema = buildZodSchema(CANONICAL_TOOL_SPECS.remove_cart_item);
export const ClearCartSchema = buildZodSchema(CANONICAL_TOOL_SPECS.clear_cart);
export const ListSavedAddressesSchema = buildZodSchema(CANONICAL_TOOL_SPECS.list_saved_addresses);
export const SelectDeliveryAddressSchema = buildZodSchema(CANONICAL_TOOL_SPECS.select_delivery_address);
export const CaptureDeliveryAddressSchema = buildZodSchema(CANONICAL_TOOL_SPECS.capture_delivery_address);
export const RenameDeliveryAddressSchema = buildZodSchema(CANONICAL_TOOL_SPECS.rename_delivery_address);
export const ConfirmAndCreateOrderSchema = buildZodSchema(CANONICAL_TOOL_SPECS.confirm_and_create_order);
export const CreateMultiOrderPlanSchema = buildZodSchema(CANONICAL_TOOL_SPECS.create_multi_order_plan);
export const ReviewMultiOrderPlanSchema = buildZodSchema(CANONICAL_TOOL_SPECS.review_multi_order_plan);
export const SetBatchDeliveryAddressSchema = buildZodSchema(CANONICAL_TOOL_SPECS.set_batch_delivery_address);
export const ConfirmOrderBatchSchema = buildZodSchema(CANONICAL_TOOL_SPECS.confirm_order_batch);
export const CancelOrderBatchChildSchema = buildZodSchema(CANONICAL_TOOL_SPECS.cancel_order_batch_child);
export const GetOrderStatusSchema = buildZodSchema(CANONICAL_TOOL_SPECS.get_order_status);
export const RequestHumanSupportSchema = buildZodSchema(CANONICAL_TOOL_SPECS.request_human_support);
export const SwitchMerchantConfirmSchema = buildZodSchema(CANONICAL_TOOL_SPECS.switch_merchant_confirm);
export const SwitchMerchantRejectSchema = buildZodSchema(CANONICAL_TOOL_SPECS.switch_merchant_reject);

export const ToolArgumentSchemas = {
  search_catalog: SearchCatalogSchema,
  list_category_options: ListCategoryOptionsSchema,
  resolve_product_name: ResolveProductNameSchema,
  compare_supermarket_basket: CompareSupermarketBasketSchema,
  get_active_cart: GetActiveCartSchema,
  add_to_cart: AddToCartSchema,
  update_cart_quantity: UpdateCartQuantitySchema,
  update_cart_variant: UpdateCartVariantSchema,
  update_cart_notes: UpdateCartNotesSchema,
  remove_cart_item: RemoveCartItemSchema,
  clear_cart: ClearCartSchema,
  list_saved_addresses: ListSavedAddressesSchema,
  get_customer_addresses: ListSavedAddressesSchema,
  select_delivery_address: SelectDeliveryAddressSchema,
  capture_delivery_address: CaptureDeliveryAddressSchema,
  rename_delivery_address: RenameDeliveryAddressSchema,
  confirm_and_create_order: ConfirmAndCreateOrderSchema,
  create_multi_order_plan: CreateMultiOrderPlanSchema,
  review_multi_order_plan: ReviewMultiOrderPlanSchema,
  set_batch_delivery_address: SetBatchDeliveryAddressSchema,
  confirm_order_batch: ConfirmOrderBatchSchema,
  cancel_order_batch_child: CancelOrderBatchChildSchema,
  get_order_status: GetOrderStatusSchema,
  request_human_support: RequestHumanSupportSchema,
  switch_merchant_confirm: SwitchMerchantConfirmSchema,
  switch_merchant_reject: SwitchMerchantRejectSchema,
};

export type ValidatedToolArguments<T extends keyof typeof ToolArgumentSchemas> = z.infer<
  (typeof ToolArgumentSchemas)[T]
>;

/**
 * Return list of all authoritative Gemini function declarations
 */
export function getAuthoritativeGeminiDeclarationsList(): any[] {
  const list: any[] = [];
  for (const spec of Object.values(CANONICAL_TOOL_SPECS)) {
    list.push(buildGeminiDeclaration(spec));
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        list.push(
          buildGeminiDeclaration({
            ...spec,
            name: alias,
            description: `Alias for ${spec.name}. ${spec.description}`,
          })
        );
      }
    }
  }
  return list;
}

/**
 * Authoritative Gemini function declarations wrapped for generateContent API payload
 */
export function getAuthoritativeGeminiToolDeclarations(): any[] {
  return [
    {
      functionDeclarations: getAuthoritativeGeminiDeclarationsList(),
    },
  ];
}
