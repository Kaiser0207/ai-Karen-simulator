"""讓 pytest 從專案根目錄能 import graph/、services/ 等頂層套件。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
