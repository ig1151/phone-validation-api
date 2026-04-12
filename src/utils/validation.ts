import Joi from 'joi';
export const validateSchema = Joi.object({
  phone: Joi.string().required().messages({ 'any.required': 'phone is required' }),
  country_code: Joi.string().length(2).uppercase().optional(),
});
export const batchSchema = Joi.object({
  phones: Joi.array().items(validateSchema).min(1).max(100).required().messages({ 'array.max': 'Batch endpoint accepts a maximum of 100 phones per request' }),
});
