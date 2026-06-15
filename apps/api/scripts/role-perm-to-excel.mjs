import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { glob} from 'glob';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

// Thư mục chứa các file controller
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const controllersDir = join(__dirname, '../src/modules');

const generateExcel = (roleData, permData) => {
  const wb = xlsx.utils.book_new();
  
  // Create "Role" sheet
  const roleSheetData = [['Method', ...roleData.roles]];
  
  for (const [method, roles] of Object.entries(roleData.methods)) {
    roleSheetData.push([method, ...roleData.roles.map(role => (roles?.includes(role) ? 'X' : ''))]);
  }
  const roleWs = xlsx.utils.aoa_to_sheet(roleSheetData);
  xlsx.utils.book_append_sheet(wb, roleWs, 'Role');

  // Create "Perm" sheet
  const permSheetData = [['Method', ...permData.perms]];
  for (const [method, perms] of Object.entries(permData.methods)) {
    permSheetData.push([method, ...permData.perms.map(perm => (perms?.includes(perm) ? 'X' : ''))]);
  }
  const permWs = xlsx.utils.aoa_to_sheet(permSheetData);
  xlsx.utils.book_append_sheet(wb, permWs, 'Perm');

  xlsx.writeFile(wb, join(__dirname, 'roles_and_perms.xlsx'));
};

const main = () => {
  const controllers = glob.sync(join(controllersDir, '**/*.controller.ts'));
  console.log("🚀 ~ main ~ controllers:", controllers);

  const rolesMap = {};
  const permissionsMap = {};

  controllers.forEach(file => {

    const code = readFileSync(file, 'utf8');
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    // console.log(ast);

    // Lấy tên file
    const fileName = file.split('/').pop().replace('.controller.ts', '');

    traverse.default(ast, {
      ClassMethod(path) {
        const methodName = path.node.key.name;
        const decorators = path.node.decorators || [];

        // console.log("decorators: ", decorators);
        rolesMap[`${fileName}`] = [];
        permissionsMap[`${fileName}`] = [];

        decorators.forEach(decorator => {
          const expression = decorator.expression;

          if (
            expression.type === 'CallExpression' &&
            expression.callee.name === 'Auth'
          ) {
            const roles = expression.arguments[0]?.elements.map(arg => arg.property.name);
            rolesMap[`${methodName}`] = roles;

            const permissions = expression.arguments[1]?.elements.map(arg => arg.property.name);
            permissionsMap[`${methodName}`] = permissions;
          }
        });
      },
    });
  });

  const allRoles = [...new Set(Object.values(rolesMap).flat())];
  const allPermissions = [...new Set(Object.values(permissionsMap).flat())];

  const roleData = {methods: rolesMap, roles: allRoles}
  const permData = {methods: permissionsMap, perms: allPermissions}

  generateExcel(roleData, permData);
};

main();
