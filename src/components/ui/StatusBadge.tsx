import React from 'react';
import { motion } from 'framer-motion';
import { Search, UserCheck, Navigation, MapPin, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';

type ServiceStatus = 
  | 'searching'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'pending';

interface StatusBadgeProps {
  status: ServiceStatus;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const statusConfig: Record<ServiceStatus, {
  label: string;
  icon: React.ElementType;
  bgClass: string;
  textClass: string;
  borderClass: string;
  glowClass: string;
}> = {
  searching: {
    label: 'Searching',
    icon: Search,
    bgClass: 'bg-warning/15',
    textClass: 'text-warning',
    borderClass: 'border-warning/30',
    glowClass: 'shadow-warning/20',
  },
  assigned: {
    label: 'Driver Assigned',
    icon: UserCheck,
    bgClass: 'bg-info/15',
    textClass: 'text-info',
    borderClass: 'border-info/30',
    glowClass: 'shadow-info/20',
  },
  en_route: {
    label: 'En Route',
    icon: Navigation,
    bgClass: 'bg-primary/15',
    textClass: 'text-primary-light',
    borderClass: 'border-primary/30',
    glowClass: 'shadow-primary/20',
  },
  arrived: {
    label: 'Arrived',
    icon: MapPin,
    bgClass: 'bg-secondary/15',
    textClass: 'text-secondary',
    borderClass: 'border-secondary/30',
    glowClass: 'shadow-secondary/20',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    bgClass: 'bg-primary/15',
    textClass: 'text-primary-light',
    borderClass: 'border-primary/30',
    glowClass: 'shadow-primary/20',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    bgClass: 'bg-success/15',
    textClass: 'text-success',
    borderClass: 'border-success/30',
    glowClass: 'shadow-success/20',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    bgClass: 'bg-error/15',
    textClass: 'text-error',
    borderClass: 'border-error/30',
    glowClass: 'shadow-error/20',
  },
  pending: {
    label: 'Pending',
    icon: AlertTriangle,
    bgClass: 'bg-warning/15',
    textClass: 'text-warning',
    borderClass: 'border-warning/30',
    glowClass: 'shadow-warning/20',
  },
};

const sizeStyles = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-base gap-2',
};

const iconSizes = {
  sm: 12,
  md: 14,
  lg: 18,
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  showIcon = true,
  size = 'md',
  animated = true,
}) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={animated ? { scale: 0.9, opacity: 0 } : false}
      animate={animated ? { scale: 1, opacity: 1 } : false}
      className={`
        inline-flex items-center font-medium rounded-full border
        ${config.bgClass} ${config.textClass} ${config.borderClass}
        ${sizeStyles[size]}
        ${className || ''}
      `}
      style={{
        boxShadow: status === 'searching' || status === 'en_route' 
          ? `0 0 12px ${config.glowClass}` 
          : undefined
      }}
    >
      {showIcon && (
        <motion.span
          animate={status === 'searching' ? { rotate: 360 } : {}}
          transition={status === 'searching' ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
        >
          <Icon size={iconSizes[size]} />
        </motion.span>
      )}
      <span>{config.label}</span>
      {(status === 'searching' || status === 'en_route') && animated && (
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
};

// Status Timeline for active service tracking
interface StatusTimelineProps {
  currentStatus: ServiceStatus;
  className?: string;
}

const timelineSteps: ServiceStatus[] = ['searching', 'assigned', 'en_route', 'arrived', 'completed'];

export const StatusTimeline: React.FC<StatusTimelineProps> = ({
  currentStatus,
  className,
}) => {
  const currentIndex = timelineSteps.indexOf(currentStatus);
  
  return (
    <div className={`flex items-center justify-between ${className || ''}`}>
      {timelineSteps.map((step, index) => {
        const config = statusConfig[step];
        const Icon = config.icon;
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center">
              <motion.div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                  ${isCompleted ? 'bg-success border-success text-white' : ''}
                  ${isCurrent ? `${config.bgClass} ${config.borderClass} ${config.textClass}` : ''}
                  ${isPending ? 'bg-surface-dark border-surface-light text-text-dark' : ''}
                `}
                animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                transition={isCurrent ? { duration: 2, repeat: Infinity } : {}}
              >
                {isCompleted ? (
                  <CheckCircle size={18} />
                ) : (
                  <Icon size={18} />
                )}
              </motion.div>
              <span className={`text-xs mt-2 ${isCurrent ? config.textClass : 'text-text-dark'}`}>
                {config.label}
              </span>
            </div>
            {index < timelineSteps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 -mt-6">
                <motion.div
                  className={`h-full rounded-full ${
                    index < currentIndex ? 'bg-success' : 'bg-surface-light'
                  }`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: index < currentIndex ? 1 : 0 }}
                  transition={{ duration: 0.5 }}
                  style={{ transformOrigin: 'left' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
