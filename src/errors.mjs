export class ConfigurationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ConfigurationError';
  }
}

export class ProcessError extends Error {
  constructor(command, exitCode, stderr = '') {
    super(`El comando "${command}" termino con codigo ${exitCode}.${stderr ? `\n${stderr.trim()}` : ''}`);
    this.name = 'ProcessError';
    this.exitCode = exitCode;
  }
}

export class ActivationRollbackError extends AggregateError {
  constructor(artifact, activationError, rollbackError) {
    super(
      [activationError, rollbackError],
      `Fallo el cambio de version de "${artifact}" y tambien su rollback. El estado remoto puede requerir intervencion manual.`,
    );
    this.name = 'ActivationRollbackError';
  }
}

export class DeploymentLogRollbackError extends AggregateError {
  constructor(publicationError, rollbackError) {
    super(
      [publicationError, rollbackError],
      'Fallo la activacion del log de despliegues y tambien su rollback. El log remoto requiere intervencion manual.',
    );
    this.name = 'DeploymentLogRollbackError';
  }
}
