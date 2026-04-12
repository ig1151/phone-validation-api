export type PhoneStatus = 'valid' | 'invalid' | 'unknown';
export type LineType = 'mobile' | 'landline' | 'voip' | 'toll_free' | 'premium' | 'unknown';

export interface ValidateRequest {
  phone: string;
  country_code?: string;
}

export interface BatchRequest {
  phones: ValidateRequest[];
}

export interface ValidationResult {
  phone: string;
  status: PhoneStatus;
  valid: boolean;
  formatted: {
    e164: string;
    international: string;
    national: string;
  };
  country: {
    code: string;
    name: string;
    dial_code: string;
  };
  line_type: LineType;
  carrier?: string;
  location?: string;
  timezone?: string[];
  is_possible: boolean;
  latency_ms: number;
  created_at: string;
}

export interface BatchResponse {
  batch_id: string;
  total: number;
  valid: number;
  invalid: number;
  results: ValidationResult[];
  latency_ms: number;
}
