"""Guarded exact two-device expansion, dry-run by default."""
from activate_avito_expansion import main
import prepare_avito_final_release as release

if __name__ == '__main__':
    main(release_module=release)
