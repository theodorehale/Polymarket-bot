import unittest
from kalshi_readonly_collector import validate_book,snapshot,get_json
class TestCollector(unittest.TestCase):
 def test_valid(self):
  x=validate_book({"orderbook_fp":{"yes_dollars":[["0.45","10"]],"no_dollars":[["0.50","8"]]}});self.assertAlmostEqual(x["yes_best_ask"],.5)
 def test_crossed(self):
  with self.assertRaises(ValueError):validate_book({"orderbook_fp":{"yes_dollars":[["0.60","1"]],"no_dollars":[["0.50","1"]]}})
 def test_missing(self):
  with self.assertRaises(ValueError):validate_book({})
 def test_zero_size(self):
  with self.assertRaises(ValueError):validate_book({"orderbook_fp":{"yes_dollars":[["0.5","0"]],"no_dollars":[]}})
 def test_forbid_nonread(self):
  with self.assertRaises(ValueError):get_json("/portfolio/orders")
 def test_invalid_ticker(self):
  with self.assertRaises(ValueError):snapshot("../orders")
if __name__=="__main__":unittest.main()
