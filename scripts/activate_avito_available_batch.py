"""VPS-only activation of the exact twelve-ID / eleven-available-ad contract."""
from activate_avito_expansion import main
import prepare_avito_available_release as release

if __name__ == '__main__':
    main(release_module=release)
