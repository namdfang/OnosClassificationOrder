import react from '@printsel/eslint-config/react';
import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist/**'] }, ...react);
