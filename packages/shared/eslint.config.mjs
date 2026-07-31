import base from '@onosfactory/eslint-config/base';
import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['dist/**'] }, ...base);
