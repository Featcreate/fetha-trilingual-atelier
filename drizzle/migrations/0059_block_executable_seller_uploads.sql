-- Block common executable, installer, binary, and script extensions at the database boundary.
-- This is extension-based defense in depth, not a substitute for content-based malware scanning.

CREATE OR REPLACE FUNCTION public.reject_executable_product_file_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _name text;
  _extension text;
BEGIN
  _name := lower(rtrim(split_part(coalesce(NEW.file_name, ''), ':', 1), ' .'));
  _extension := substring(_name from '\\.([^.]*)$');

  IF _extension = ANY (ARRAY[
    '386', 'action', 'apk', 'app', 'appimage', 'appx', 'bash', 'bat', 'bin',
    'cab', 'cgi', 'cmd', 'com', 'command', 'cpl', 'deb', 'desktop', 'dll',
    'dmg', 'drv', 'elf', 'exe', 'hta', 'img', 'iso', 'jar', 'jse', 'lnk',
    'mjs', 'msi', 'msp', 'mst', 'msix', 'ocx', 'pif', 'pkg', 'pl', 'ps1',
    'ps1xml', 'ps2', 'psc1', 'psd1', 'psm1', 'py', 'pyc', 'rb', 'reg',
    'rpm', 'run', 'scr', 'service', 'sh', 'so', 'sys', 'vbe', 'vbs', 'wasm',
    'wsf', 'wsh', 'zsh'
  ]) THEN
    RAISE EXCEPTION 'executable_file_type_not_allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_executable_product_file_version
  ON public.product_file_versions;

CREATE TRIGGER reject_executable_product_file_version
BEFORE INSERT OR UPDATE OF file_name ON public.product_file_versions
FOR EACH ROW
EXECUTE FUNCTION public.reject_executable_product_file_version();

REVOKE ALL ON FUNCTION public.reject_executable_product_file_version() FROM PUBLIC, anon, authenticated;
