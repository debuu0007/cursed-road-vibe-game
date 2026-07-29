package curse

import (
	"reflect"
	"testing"
)

func TestTimelineDeterminism(t *testing.T) {
	first := Generate(0xC012ED, 10_000)
	second := Generate(0xC012ED, 10_000)
	if !reflect.DeepEqual(first, second) {
		t.Fatal("same seed produced different timelines")
	}
	third := Generate(0xC012EE, 10_000)
	if reflect.DeepEqual(first, third) {
		t.Fatal("different seeds produced identical timelines")
	}
	if len(first) == 0 {
		t.Fatal("timeline is empty")
	}
}

func TestChainedSpacingAndWarnings(t *testing.T) {
	events := Generate(0xC012ED, 100_000)
	foundChain := false
	for i, event := range events {
		if event.WarningDistance >= event.Distance {
			t.Fatalf("event %d has no lead-in warning", event.ID)
		}
		if event.Chained {
			foundChain = true
			spacing := event.Distance - events[i-1].Distance
			if spacing < 8 || spacing > 18 {
				t.Fatalf("chain spacing %.2f outside [8,18]", spacing)
			}
		}
	}
	if !foundChain {
		t.Fatal("large deterministic timeline contained no chains")
	}
}
