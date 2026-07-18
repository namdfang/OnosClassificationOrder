import { DATABASE_CREATED_AT_FIELD_NAME, DATABASE_UPDATED_AT_FIELD_NAME } from '@core/constants';
import type { SchemaOptions } from '@nestjs/mongoose';
import { Schema } from '@nestjs/mongoose';

export function DatabaseEntity(options?: SchemaOptions): ClassDecorator {
  return Schema({
    ...options,
    // _id: false,
    versionKey: false,
    timestamps: {
      createdAt: DATABASE_CREATED_AT_FIELD_NAME,
      updatedAt: DATABASE_UPDATED_AT_FIELD_NAME,
    },
    toJSON: {
      getters: true,
      virtuals: true,
    },
  });
}
