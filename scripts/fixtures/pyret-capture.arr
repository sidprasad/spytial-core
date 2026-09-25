import capture-test as Capture
import file("left.arr") as L
import file("right.arr") as R
include string-dict
include tables

data Cell: cell(ref next) end
data Hidden: hidden(visible, secret) with:
  method _output(self): raise("structural capture must not call this") end
end

a = L.same(1, 2)
c = cell(nothing)
c!{next: c}
arr = [raw-array: 1/3, 123456789012345678901234567890, ~1, 1]
Capture.capture({
  left: a, shared-value: a, equal: L.same(1, 2), right: R.same(3, 4),
  cycle: c, hidden: hidden(1, 999), numbers: arr,
  dictionary: [string-dict: "a", arr, "b", arr],
  table-value: table: first, second row: arr, a row: arr, a end
})
