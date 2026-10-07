import unittest
import numpy as np
from PIL import Image
from retouch_catalog_photo_backgrounds import repair_spot, repair_bottom_seam


class RetouchSafetyTests(unittest.TestCase):
    def blemish(self):
        yy, xx = np.mgrid[:600, :800]
        background = np.ones((600, 800, 3)) * [245, 239, 230]
        background -= (20 * np.exp(-((xx-670)**2 + (yy-480)**2)/900))[..., None]
        return Image.fromarray(background.round().astype(np.uint8))

    def test_background_only_and_deterministic(self):
        before = self.blemish()
        after, mask, _ = repair_spot(before, [.65,.6,.98,.98], [[0,0,1,.58]])
        again, _, _ = repair_spot(before, [.65,.6,.98,.98], [[0,0,1,.58]])
        self.assertTrue(np.array_equal(np.asarray(before)[~mask], np.asarray(after)[~mask]))
        self.assertTrue(np.array_equal(np.asarray(after), np.asarray(again)))
        self.assertGreater(np.asarray(after)[480,670].mean(), np.asarray(before)[480,670].mean())

    def test_device_overlap_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "overlaps"):
            repair_spot(self.blemish(), [.65,.6,.98,.98], [[0,0,1,1]])

    def test_manual_center_and_invalid_center(self):
        _, _, details = repair_spot(self.blemish(), [.65,.6,.98,.98], [[0,0,1,.58]], [670,480])
        self.assertEqual(details["center"], [670,480])
        with self.assertRaises(ValueError):
            repair_spot(self.blemish(), [.65,.6,.98,.98], [[0,0,1,.58]], [0,0])

    def test_missing_protection_and_bad_regions_are_rejected(self):
        for region, protection in [([.65,.6,.98,.98], []), ([-1,0,1,1], [[0,0,1,.5]]),
                                   ([.8,.8,.7,.9], [[0,0,1,.5]]), ([0,0,.01,.01], [[0,0,1,.5]])]:
            with self.assertRaises(ValueError):
                repair_spot(self.blemish(), region, protection)

    def test_clean_background_is_not_retouched(self):
        with self.assertRaisesRegex(ValueError, "No confirmed"):
            repair_spot(Image.new("RGB", (800,600), (245,239,230)), [.65,.6,.98,.98], [[0,0,1,.5]])

    def test_seam_keeps_protected_area(self):
        before = Image.new("RGB", (800,600), (240,235,230))
        after, mask = repair_bottom_seam(before, .98, .70)
        self.assertTrue(np.array_equal(np.asarray(before)[~mask], np.asarray(after)[~mask]))
        with self.assertRaises(ValueError):
            repair_bottom_seam(before, .8, .78)


if __name__ == "__main__":
    unittest.main()
