import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('android_emulator_launcher_anr.py')
spec = importlib.util.spec_from_file_location('android_emulator_launcher_anr', MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EmulatorLauncherAnrTests(unittest.TestCase):
    def test_extracts_only_quickstep_wait_button_center(self):
        xml = '''<hierarchy><node text="Quickstep isn't responding" resource-id="android:id/alertTitle" package="android"/><node text="Wait" resource-id="android:id/aerr_wait" package="android" bounds="[70,1269][1010,1395]"/></hierarchy>'''
        self.assertEqual(module.quickstep_wait_coordinates(xml), (540, 1332))

    def test_never_interacts_with_an_app_or_other_system_dialog(self):
        other = '''<hierarchy><node text="KleenestOS isn't responding" resource-id="android:id/alertTitle" package="android"/><node text="Wait" resource-id="android:id/aerr_wait" package="android" bounds="[70,1269][1010,1395]"/></hierarchy>'''
        self.assertIsNone(module.quickstep_wait_coordinates(other))
        self.assertIsNone(module.quickstep_wait_coordinates("""<hierarchy><node text="Quickstep isn't responding"/><node text="Wait" resource-id="android:id/aerr_wait" package="com.kleenest.platform" bounds="[70,1269][1010,1395]"/></hierarchy>"""))

    def test_rejects_malformed_or_inverted_button_coordinates(self):
        self.assertIsNone(module.quickstep_wait_coordinates('broken XML <'))
        self.assertIsNone(module.quickstep_wait_coordinates("""<hierarchy><node text="Quickstep isn't responding"/><node resource-id="android:id/aerr_wait" package="android" bounds="[1010,1395][70,1269]"/></hierarchy>"""))


if __name__ == '__main__':
    unittest.main()
