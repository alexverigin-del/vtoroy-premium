"""VPS-only guarded activation of the exact approved nine-ad follow-up."""
from activate_avito_expansion import main
import prepare_avito_followup_release as release


if __name__ == '__main__':
    main(release_module=release)
