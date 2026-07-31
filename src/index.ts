// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

export * from "./types.js";
export * from "./profiles.js";
export * from "./validation.js";
export * from "./registration.js";
export * from "./discovery.js";
export * from "./lifecycle.js";
export * from "./governance-assist.js";
export * from "./operator-assist.js";
export * from "./capability-assist.js";
export * from "./resource-description.js";

import { createDefaultProfile } from "./profiles.js";
import { discoverResourcesWithSkill } from "./discovery.js";
import { governanceAssistWithSkill } from "./governance-assist.js";
import { inspectLifecycleWithSkill } from "./lifecycle.js";
import { operatorAssistWithSkill } from "./operator-assist.js";
import {
  suggestCapabilityTagsWithSkill,
  suggestDiscoveryQueryWithSkill,
  suggestRegistrationMetadataWithSkill,
} from "./capability-assist.js";
import { registerResourceWithSkill } from "./registration.js";
import {
  draftRegistrationFromResourceDescriptionWithSkill,
  registerBatchFromResourceDescriptionsWithSkill,
  registerFromResourceDescriptionWithSkill,
} from "./resource-description.js";
import { validateRegistrationInput } from "./validation.js";
import type {
  DiscoveryQueryAssistInput,
  DiscoverySkillInput,
  GovernanceAssistInput,
  LifecycleSkillInput,
  OanSkillProfile,
  OperatorAssistInput,
  RegistrationMetadataAssistInput,
  RegistrationSkillInput,
  ResourceDescriptionBatchRegistrationInput,
  ResourceDescriptionRegistrationInput,
  ValidationSkillInput,
  CapabilityAssistInput,
} from "./types.js";

export class OanSkill {
  readonly profile: OanSkillProfile;

  constructor(profile: Partial<OanSkillProfile> = {}, private readonly options: { fetchImpl?: typeof fetch } = {}) {
    this.profile = createDefaultProfile(profile);
  }

  validate(input: ValidationSkillInput) {
    return validateRegistrationInput(input);
  }

  register(input: RegistrationSkillInput) {
    return registerResourceWithSkill(this.profile, input, this.options);
  }

  draftRegistrationFromResourceDescription(input: ResourceDescriptionRegistrationInput) {
    return draftRegistrationFromResourceDescriptionWithSkill(input);
  }

  registerFromResourceDescription(input: ResourceDescriptionRegistrationInput) {
    return registerFromResourceDescriptionWithSkill(this.profile, input, this.options);
  }

  registerBatchFromResourceDescriptions(input: ResourceDescriptionBatchRegistrationInput) {
    return registerBatchFromResourceDescriptionsWithSkill(this.profile, input, this.options);
  }

  discover(input: DiscoverySkillInput) {
    return discoverResourcesWithSkill(this.profile, input, this.options);
  }

  lifecycle(input: LifecycleSkillInput) {
    return inspectLifecycleWithSkill(this.profile, input, this.options);
  }

  governanceAssist(input: GovernanceAssistInput) {
    return governanceAssistWithSkill(this.profile, input, this.options);
  }

  operatorAssist(input: OperatorAssistInput) {
    return operatorAssistWithSkill(this.profile, input, this.options);
  }

  capabilityAssist(input: CapabilityAssistInput) {
    return suggestCapabilityTagsWithSkill(this.profile, input, this.options);
  }

  registrationMetadataAssist(input: RegistrationMetadataAssistInput) {
    return suggestRegistrationMetadataWithSkill(this.profile, input, this.options);
  }

  discoveryQueryAssist(input: DiscoveryQueryAssistInput) {
    return suggestDiscoveryQueryWithSkill(this.profile, input, this.options);
  }
}
