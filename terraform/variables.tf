variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "elevation-compare"
}

variable "region" {
  description = "GCP region for Cloud Run and Artifact Registry"
  type        = string
  default     = "us-central1"
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format, used for Workload Identity Federation"
  type        = string
  default     = "mikejshea/elevation-compare"
}
