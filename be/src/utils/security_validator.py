import ast
import sys

# Configuration: Banned imports and functions
BANNED_IMPORTS = {'os', 'sys', 'subprocess', 'shutil', 'pickle', 'importlib', 'pathlib'}
BANNED_FUNCTIONS = {'open', 'eval', 'exec', '__import__', 'input', 'globals', 'locals'}

class SecurityVisitor(ast.NodeVisitor):
    def visit_Import(self, node):
        for alias in node.names:
            if alias.name.split('.')[0] in BANNED_IMPORTS:
                raise ValueError(f"Security Violation: Importing '{alias.name}' is not allowed.")
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module and node.module.split('.')[0] in BANNED_IMPORTS:
            raise ValueError(f"Security Violation: Importing from '{node.module}' is not allowed.")
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name):
            if node.func.id in BANNED_FUNCTIONS:
                raise ValueError(f"Security Violation: Function '{node.func.id}' is not allowed.")
        self.generic_visit(node)

def validate_code():
    try:
        # Read code from Standard Input (stdin) instead of a file
        code = sys.stdin.read()
        
        if not code.strip():
            return # Empty code is technically safe from execution perspective, or handle as error
            
        tree = ast.parse(code)
        SecurityVisitor().visit(tree)
        
    except SyntaxError as e:
        print(f"Syntax Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Validation Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    validate_code()
