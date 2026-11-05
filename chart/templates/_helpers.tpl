{{- define "casrep-command.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "casrep-command.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- include "casrep-command.name" . }}
{{- end }}
{{- end }}

{{- define "casrep-command.labels" -}}
app.kubernetes.io/name: {{ include "casrep-command.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "casrep-command.selectorLabels" -}}
app.kubernetes.io/name: {{ include "casrep-command.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
