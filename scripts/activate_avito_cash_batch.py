"""VPS-only guarded fifteen-ID cash-confirmed expansion."""
from activate_avito_expansion import main
import prepare_avito_cash_release as release

if __name__ == "__main__":
    main(release_module=release)
