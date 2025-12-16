"use client";

import { BlessingOptions } from "@/lib/api-client";
import { occasions, targetPersons, styles, getDateBasedRecommendations, popularCombinations, RecommendationItem } from "@/lib/config";
import SelectInput from "./SelectInput";
import RecommendationTags from "./RecommendationTags";

interface TemplateModeFormProps {
  options: BlessingOptions;
  onOptionsChange: (options: BlessingOptions) => void;
}

export default function TemplateModeForm({
  options,
  onOptionsChange,
}: TemplateModeFormProps) {
  const dateRecommendations = getDateBasedRecommendations();
  const allRecommendations = [...dateRecommendations, ...popularCombinations];

  const applyRecommendation = (recommendation: RecommendationItem) => {
    onOptionsChange({
      ...options,
      scenario: recommendation.scenario,
      targetPerson: recommendation.targetPerson,
      style: recommendation.style,
      festival: "",
      useSmartMode: false
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn overflow-y-auto pr-2 h-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SelectInput
          id="scenario-select"
          label="场合"
          value={options.scenario}
          placeholder="选择场合"
          options={occasions}
          onChange={(value) =>
            onOptionsChange({
              ...options,
              scenario: value,
              festival: "",
            })
          }
        />

        <SelectInput
          id="target-person-select"
          label="对象"
          value={options.targetPerson}
          placeholder="选择对象"
          options={targetPersons}
          onChange={(value) =>
            onOptionsChange({
              ...options,
              targetPerson: value,
            })
          }
        />

        <SelectInput
          id="style-select"
          label="风格"
          value={options.style || ""}
          placeholder="选择风格"
          options={styles}
          onChange={(value) =>
            onOptionsChange({ ...options, style: value })
          }
        />
      </div>

      <RecommendationTags
        recommendations={allRecommendations}
        onApply={applyRecommendation}
      />
    </div>
  );
}