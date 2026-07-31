import react from '@onosfactory/eslint-config/react';
import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist/**'] }, ...react);
