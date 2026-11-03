import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus, LayoutGrid, Move, MousePointer,
  UserPlus, X, Trash2, Grid, HelpCircle, AlertTriangle, Printer, Copy,
  ArrowRight, ArrowLeft, CheckCircle2, Lock
} from 'lucide-react';

export interface Student {
  id: string;
  name: string;
}

export interface TableBlock {
  id: string;
  x: number;
  y: number;
  student_id: string | null;
  is_front?: boolean;
}

export interface SeatingChart {
  id: string;
  name: string;
  blocks: TableBlock[];
}

export interface Classroom {
  id: string;
  name: string;
  seating_chart: SeatingChart;
}

export interface Class {
  id: string;
  name: string;
  students: Student[];
  classrooms: Classroom[];
  seating_chart?: SeatingChart | null;
}

const BLOCK_SIZE = 55;
const CANVAS_WIDTH = 1050;
const CANVAS_HEIGHT = 680;

const getFrontBlock = (): TableBlock => {
  const FRONT_WIDTH_BLOCKS = 5;
  const totalWidth = FRONT_WIDTH_BLOCKS * BLOCK_SIZE;
  const x = Math.round((CANVAS_WIDTH - totalWidth) / 2 / BLOCK_SIZE) * BLOCK_SIZE;
  const y = 10; // Plassert helt øverst
  return {
    id: 'front-tavle',
    x,
    y,
    student_id: null,
    is_front: true
  };
};

const ensureFrontBlock = (chart: SeatingChart): SeatingChart => {
  const hasFront = chart.blocks.some(b => b.is_front);
  if (!hasFront) {
    return {
      ...chart,
      blocks: [getFrontBlock(), ...chart.blocks]
    };
  }
  return chart;
};

export default function App() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const [newClassName, setNewClassName] = useState('');
  const [newStudentName, setNewStudentName] = useState('');

  const [showTutorial, setShowTutorial] = useState<boolean>(() => {
    const seen = localStorage.getItem('klassekart_seen_tutorial');
    return seen !== 'true';
  });
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isInteractiveTutorial, setIsInteractiveTutorial] = useState<boolean>(() => {
    const seen = localStorage.getItem('klassekart_seen_tutorial');
    return seen !== 'true';
  });

  const [showExportModal, setShowExportModal] = useState(false);

  const [snapToGridEnabled, setSnapToGridEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('klassekart_snap_grid');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showChartDropdown, setShowChartDropdown] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCluster, setDragCluster] = useState<{ id: string; startX: number; startY: number; clusterOffsets: { id: string; offsetX: number; offsetY: number }[] } | null>(null);

  const [searchStudent, setSearchStudent] = useState('');
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    localStorage.setItem('klassekart_snap_grid', JSON.stringify(snapToGridEnabled));
  }, [snapToGridEnabled]);

  const loadClasses = async () => {
    try {
      const res: Class[] = await invoke('get_classes');
      const normalized = (res || []).map(cls => ({
        ...cls,
        classrooms: (cls.classrooms || []).map(room => ({
          ...room,
          seating_chart: ensureFrontBlock(room.seating_chart)
        }))
      }));
      setClasses(normalized);
      if (normalized && normalized.length > 0 && !selectedClassId) {
        const firstClass = normalized[0];
        setSelectedClassId(firstClass.id);
        if (firstClass.classrooms && firstClass.classrooms.length > 0) {
          setSelectedClassroomId(firstClass.classrooms[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load classes:', e);
    }
  };

  const saveClassesToBackend = async (updatedClasses: Class[]) => {
    setClasses(updatedClasses);
    try {
      await invoke('save_classes', { classes: updatedClasses });
    } catch (e) {
      console.error('Failed to save classes:', e);
    }
  };

  const currentClass = classes.find((c) => c.id === selectedClassId) || null;
  const currentClassroom = currentClass?.classrooms.find((r) => r.id === selectedClassroomId) || null;
  const currentChart = currentClassroom ? ensureFrontBlock(currentClassroom.seating_chart) : null;

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const newChartId = 'chart-' + Date.now();
    const newClass: Class = {
      id: 'class-' + Date.now(),
      name: newClassName.trim(),
      students: [],
      classrooms: [{
        id: newChartId,
        name: 'Klasserom',
        seating_chart: { id: newChartId, name: 'Klasserom', blocks: [getFrontBlock()] }
      }],
    };
    const updated = [...classes, newClass];
    saveClassesToBackend(updated);
    setSelectedClassId(newClass.id);
    setSelectedClassroomId(newChartId);
    setNewClassName('');
  };

  const handleDeleteClass = (classId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const clsToDelete = classes.find(c => c.id === classId);
    if (!window.confirm(`Er du sikker på at du vil slette klassen "${clsToDelete?.name || ''}" og alt tilhørende innhold?`)) return;

    const updated = classes.filter(c => c.id !== classId);
    saveClassesToBackend(updated);
    if (selectedClassId === classId) {
      const newClass = updated.length > 0 ? updated[0] : null;
      setSelectedClassId(newClass ? newClass.id : null);
      setSelectedClassroomId(newClass && newClass.classrooms && newClass.classrooms.length > 0 ? newClass.classrooms[0].id : null);
    }
  };

  const handleAddStudent = () => {
    if (!selectedClassId || !newStudentName.trim()) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return {
          ...c,
          students: [...c.students, { id: 'std-' + Date.now(), name: newStudentName.trim() }],
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
    setNewStudentName('');
  };

  const handleRemoveStudent = (stdId: string) => {
    if (!selectedClassId) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        const updatedBlocks = c.classrooms.map(r => ({
          ...r,
          seating_chart: {
            ...r.seating_chart,
            blocks: r.seating_chart.blocks.map((blk) =>
              blk.student_id === stdId ? { ...blk, student_id: null } : blk
            ),
          },
        }));
        return {
          ...c,
          students: c.students.filter((s) => s.id !== stdId),
          classrooms: updatedBlocks,
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
  };

  const updateCurrentChart = (updater: (chart: SeatingChart) => SeatingChart) => {
    if (!selectedClassId || !selectedClassroomId) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return {
          ...c,
          classrooms: c.classrooms.map((r) => {
            if (r.id === selectedClassroomId) {
              return { ...r, seating_chart: ensureFrontBlock(updater(r.seating_chart)) };
            }
            return r;
          }),
        };
      }
      return c;
    });
    saveClassesToBackend(updated);
  };

  const handleAddChart = () => {
    if (!selectedClassId) return;
    const name = window.prompt('Gi kartet et navn:', 'Nytt klasserom');
    if (!name || !name.trim()) return;
    const newChartId = 'chart-' + Date.now();
    const newClassroom: Classroom = {
      id: newChartId,
      name: name.trim(),
      seating_chart: { id: newChartId, name: name.trim(), blocks: [getFrontBlock()] },
    };
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return { ...c, classrooms: [...c.classrooms, newClassroom] };
      }
      return c;
    });
    saveClassesToBackend(updated);
    setSelectedClassroomId(newChartId);
  };

  const handleRemoveChart = (chartId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const cls = classes.find(c => c.id === selectedClassId);
    if (!cls) return;
    const chart = cls.classrooms.find(r => r.id === chartId);
    if (!window.confirm(`Er du sikker på at du vil slette klasserommet "${chart?.name || ''}" og alt tilhørende innhold?`)) return;
    const updated = classes.map((c) => {
      if (c.id === selectedClassId) {
        return { ...c, classrooms: c.classrooms.filter((r) => r.id !== chartId) };
      }
      return c;
    });
    saveClassesToBackend(updated);
    if (selectedClassroomId === chartId) {
      const remaining = cls.classrooms.filter(r => r.id !== chartId);
      setSelectedClassroomId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleSelectChart = (chartId: string) => {
    setSelectedClassroomId(chartId);
  };

  const handleAddGroupShape = (type: 1 | 2 | 3 | 4) => {
    if (!currentChart) return;

    let offsets: { dx: number; dy: number }[] = [];
    if (type === 1) offsets = [{ dx: 0, dy: 0 }];
    else if (type === 2) offsets = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }];
    else if (type === 3) offsets = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }];
    else if (type === 4) offsets = [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }];

    const existingBlocks = currentChart.blocks;
    let foundOriginX = 40;
    let foundOriginY = 120;
    let placed = false;

    for (let y = 120; y <= CANVAS_HEIGHT - 150; y += BLOCK_SIZE) {
      if (placed) break;
      for (let x = 40; x <= CANVAS_WIDTH - 200; x += BLOCK_SIZE) {
        const canFitClean = offsets.every(off => {
          const testX = x + off.dx * BLOCK_SIZE;
          const testY = y + off.dy * BLOCK_SIZE;
          if (testX + BLOCK_SIZE > CANVAS_WIDTH - 20 || testY + BLOCK_SIZE > CANVAS_HEIGHT - 20) return false;
          const overlaps = existingBlocks.some(b => Math.abs(b.x - testX) < 5 && Math.abs(b.y - testY) < 5);
          const touchesOthers = existingBlocks.some(b =>
            (Math.abs(b.x - testX) === BLOCK_SIZE && b.y === testY) ||
            (Math.abs(b.y - testY) === BLOCK_SIZE && b.x === testX)
          );
          return !overlaps && !touchesOthers;
        });

        if (canFitClean) {
          foundOriginX = x;
          foundOriginY = y;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      for (let y = 120; y <= CANVAS_HEIGHT - 150; y += BLOCK_SIZE) {
        if (placed) break;
        for (let x = 40; x <= CANVAS_WIDTH - 200; x += BLOCK_SIZE) {
          const canFitAny = offsets.every(off => {
            const testX = x + off.dx * BLOCK_SIZE;
            const testY = y + off.dy * BLOCK_SIZE;
            if (testX + BLOCK_SIZE > CANVAS_WIDTH - 20 || testY + BLOCK_SIZE > CANVAS_HEIGHT - 20) return false;
            return !existingBlocks.some(b => Math.abs(b.x - testX) < 5 && Math.abs(b.y - testY) < 5);
          });

          if (canFitAny) {
            foundOriginX = x;
            foundOriginY = y;
            placed = true;
            break;
          }
        }
      }
    }

    const newBlocks: TableBlock[] = offsets.map((off, idx) => ({
      id: 'blk-' + Date.now() + '-' + idx,
      x: foundOriginX + (off.dx * BLOCK_SIZE),
      y: foundOriginY + (off.dy * BLOCK_SIZE),
      student_id: null,
    }));

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: [...chart.blocks, ...newBlocks],
    }));
  };

  const handleDeleteBlock = (blockId: string) => {
    const block = currentChart?.blocks.find(b => b.id === blockId);
    if (block?.is_front) return;
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.filter(b => b.id !== blockId),
    }));
    setActiveBlockId(null);
  };

  const handleClearAllBlocks = () => {
    if (!window.confirm('Er du sikker på at du vil slette alle pulter i dette klasserommet?')) return;
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.filter(b => b.is_front),
    }));
    setActiveBlockId(null);
  };

  const handleWipeAllAppData = () => {
    if (!window.confirm('⚠️ ADVARSEL: Dette sletter ALLE klasser, elevlister og kart permanent! Er du helt sikker?')) return;
    if (!window.confirm('Siste sjanse: Er du 100% sikker på at du vil nullstille hele appen?')) return;

    saveClassesToBackend([]);
    setSelectedClassId(null);
    localStorage.clear();
    setIsInteractiveTutorial(true);
    setShowTutorial(true);
    setTutorialStep(0);
  };

  const handleDetachBlock = (blockId: string) => {
    const block = currentChart?.blocks.find(b => b.id === blockId);
    if (block?.is_front) return;
    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map(b => {
        if (b.id === blockId) {
          return { ...b, x: b.x + 25, y: b.y + 25 };
        }
        return b;
      }),
    }));
  };

  const getClusterBlockIds = (startId: string, blocks: TableBlock[]): string[] => {
    const startBlock = blocks.find(b => b.id === startId);
    if (startBlock?.is_front) return [startId]; // Fronten kan dras alene

    const visited = new Set<string>();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const curr = blocks.find(b => b.id === currId);
      if (!curr) continue;

      for (const other of blocks) {
        if (other.is_front || visited.has(other.id)) continue;
        const isAdjacent =
          (Math.abs(curr.x - other.x) === BLOCK_SIZE && curr.y === other.y) ||
          (Math.abs(curr.y - other.y) === BLOCK_SIZE && curr.x === other.x);

        if (isAdjacent) {
          visited.add(other.id);
          queue.push(other.id);
        }
      }
    }
    return Array.from(visited);
  };

  const handleDragStop = (clusterIds: string[]) => {
    setIsDragging(false);
    setDragCluster(null);
    if (!currentChart) return;

    const SNAP_THRESHOLD = 35;
    let snapOffsetX = 0;
    let snapOffsetY = 0;
    let foundSnap = false;

    const isDraggingFront = clusterIds.length === 1 && currentChart.blocks.find(b => b.id === clusterIds[0])?.is_front;

    const clusterBlocks = currentChart.blocks.filter(b => clusterIds.includes(b.id));
    const otherBlocks = currentChart.blocks.filter(b => !clusterIds.includes(b.id));

    if (!isDraggingFront) {
      for (const cb of clusterBlocks) {
        if (foundSnap) break;
        for (const ob of otherBlocks) {
          if (Math.abs(cb.x - (ob.x + BLOCK_SIZE)) < SNAP_THRESHOLD && Math.abs(cb.y - ob.y) < SNAP_THRESHOLD) {
            snapOffsetX = (ob.x + BLOCK_SIZE) - cb.x;
            snapOffsetY = ob.y - cb.y;
            foundSnap = true;
            break;
          }
          else if (Math.abs((cb.x + BLOCK_SIZE) - ob.x) < SNAP_THRESHOLD && Math.abs(cb.y - ob.y) < SNAP_THRESHOLD) {
            snapOffsetX = (ob.x - BLOCK_SIZE) - cb.x;
            snapOffsetY = ob.y - cb.y;
            foundSnap = true;
            break;
          }
          else if (Math.abs(cb.y - (ob.y + BLOCK_SIZE)) < SNAP_THRESHOLD && Math.abs(cb.x - ob.x) < SNAP_THRESHOLD) {
            snapOffsetX = ob.x - cb.x;
            snapOffsetY = (ob.y + BLOCK_SIZE) - cb.y;
            foundSnap = true;
            break;
          }
          else if (Math.abs((cb.y + BLOCK_SIZE) - ob.y) < SNAP_THRESHOLD && Math.abs(cb.x - ob.x) < SNAP_THRESHOLD) {
            snapOffsetX = ob.x - cb.x;
            snapOffsetY = (ob.y - BLOCK_SIZE) - cb.y;
            foundSnap = true;
            break;
          }
        }
      }
    }

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map(b => {
        let newX = b.x;
        let newY = b.y;

        if (clusterIds.includes(b.id)) {
          if (foundSnap) {
            newX += snapOffsetX;
            newY += snapOffsetY;
          }
          if (snapToGridEnabled) {
            newX = Math.round(newX / BLOCK_SIZE) * BLOCK_SIZE;
            newY = Math.round(newY / BLOCK_SIZE) * BLOCK_SIZE;
          }
          const maxWidth = b.is_front ? CANVAS_WIDTH - (BLOCK_SIZE * 5) : CANVAS_WIDTH - BLOCK_SIZE;
          newX = Math.min(Math.max(0, newX), maxWidth);
          newY = Math.min(Math.max(0, newY), CANVAS_HEIGHT - BLOCK_SIZE);
          return { ...b, x: newX, y: newY };
        }
        return b;
      })
    }));
  };

  const handleAssignStudent = (studentId: string | null) => {
    if (!activeBlockId || !currentChart) return;
    const block = currentChart.blocks.find(b => b.id === activeBlockId);
    if (block?.is_front) return;

    updateCurrentChart((chart) => ({
      ...chart,
      blocks: chart.blocks.map((b) => {
        if (b.id === activeBlockId) {
          return { ...b, student_id: studentId };
        }
        if (studentId && b.student_id === studentId) {
          return { ...b, student_id: null };
        }
        return b;
      }),
    }));
    setActiveBlockId(null);
  };

  const getTableBlockStyle = (block: TableBlock, blocks: TableBlock[] = [], isAssigned: boolean, isPrint = false, isBeingDragged = false) => {
    if (block.is_front) {
      return {
        borderRadius: '8px',
        border: '2px solid #4338ca',
      };
    }
    if (isBeingDragged) {
      const defaultColor = isPrint ? '#1d4ed8' : '#047857';
      const assignedColor = isPrint ? '#1d4ed8' : '#1d4ed8';
      const borderColor = isAssigned ? assignedColor : defaultColor;
      return {
        borderRadius: '10px',
        border: `2px solid ${borderColor}`,
      };
    }

    const list = blocks || [];
    const tolerance = 5;
    const size = BLOCK_SIZE;

    const hasTop = list.some(b => !b.is_front && Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y - size)) < tolerance);
    const hasBottom = list.some(b => !b.is_front && Math.abs(b.x - block.x) < tolerance && Math.abs(b.y - (block.y + size)) < tolerance);
    const hasLeft = list.some(b => !b.is_front && Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x - size)) < tolerance);
    const hasRight = list.some(b => !b.is_front && Math.abs(b.y - block.y) < tolerance && Math.abs(b.x - (block.x + size)) < tolerance);

    const tl = hasTop || hasLeft ? '0px' : '10px';
    const tr = hasTop || hasRight ? '0px' : '10px';
    const br = hasBottom || hasRight ? '0px' : '10px';
    const bl = hasBottom || hasLeft ? '0px' : '10px';

    const defaultColor = isPrint ? '#1d4ed8' : '#047857';
    const assignedColor = isPrint ? '#1d4ed8' : '#1d4ed8';
    const borderColor = isAssigned ? assignedColor : defaultColor;

    return {
      borderRadius: `${tl} ${tr} ${br} ${bl}`,
      borderTop: hasTop ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderBottom: hasBottom ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderLeft: hasLeft ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
      borderRight: hasRight ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
    };
  };

  const getDynamicFontSize = (name: string) => {
    if (!name) return '0.8rem';
    if (name.length > 14) return '0.42rem';
    if (name.length > 11) return '0.5rem';
    if (name.length > 8) return '0.58rem';
    if (name.length > 5) return '0.68rem';
    return '0.8rem';
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyClipboard = async () => {
    if (!printAreaRef.current) return;
    try {
      let textSummary = `KLASSEKART: ${currentClass?.name || 'Klasse'}\n\n`;
      currentChart?.blocks.filter(b => !b.is_front).forEach((b, idx) => {
        const student = currentClass?.students.find(s => s.id === b.student_id);
        textSummary += `Pult ${idx + 1}: ${student ? student.name : 'Ledig'}\n`;
      });
      await navigator.clipboard.writeText(textSummary);
      alert('Klassekartet (tekstform) er kopiert til utklipstavlen!');
    } catch (err) {
      alert('Kunne ikke kopiere til utklipstavle.');
    }
  };

  const tutorialSteps = [
    {
      title: "Velkommen til Klassekart! 🏫",
      desc: "Her kan du lage et digitalt oversiktskart over klasserommet ditt, holde styr på hvem som sitter hvor, og skrive ut arket på papir.",
      icon: <LayoutGrid size={48} color="#2563eb" />
    },
    {
      title: "Steg 1: Lag klasse 📝",
      desc: "1. Se helt til venstre på skjermen:\nKlikk med musa i feltet der det står 'F.eks. 10B...'.\n2. Skriv navnet på klassen på tastaturet og trykk på den blå knappen 'Ny klasse'.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <UserPlus size={48} color="#059669" />
    },
    {
      title: "Steg 2: Legg til elev 👤",
      desc: "1. Se i sidepanelet til venstre under elevlisten:\nSkriv inn navnet på en elev.\n2. Trykk på den grønne knappen for å legge eleven til i listen.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <UserPlus size={48} color="#059669" />
    },
    {
      title: "Steg 3: Bygg pulter 🪑",
      desc: "1. Se øverst på skjermen:\nKlikk på knappen 'Bygg / Flytt pulter'.\n2. Trykk på f.eks. '+ 1 Pult' for å få en pult ut på det rutete feltet.\n3. Hvis du drar flere pulter inntil hverandre, kobler de seg automatisk sammen til større grupper!\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <Move size={48} color="#2563eb" />
    },
    {
      title: "Steg 4: Plassér elev 👤",
      desc: "1. Se øverst på skjermen:\nKlikk på knappen 'Plassér elever'.\n2. Klikk med musa på pulten du lagde i stad.\n3. Klikk på elevens navn i menyen som dukker opp til høyre.\n\n*(Fullfør dette for å låse opp neste steg!)*",
      icon: <MousePointer size={48} color="#d97706" />
    },
    {
      title: "Steg 5: Skriv ut / lagre 🖨️",
      desc: "1. Når du er ferdig med å plassere elever:\nKlikk på den blå knappen 'Skriv ut / Lagre kart' helt øverst til høyre.\n2. Der kan du skrive ut arket på en fysisk skriver.",
      icon: <Printer size={48} color="#7c3aed" />
    }
  ];

  const isCurrentStepCompleted = () => {
    if (!isInteractiveTutorial) return true;
    if (tutorialStep === 0) return true;
    if (tutorialStep === 1) return classes.length > 0;
    if (tutorialStep === 2) return currentClass ? currentClass.students.length > 0 : false;
    if (tutorialStep === 3) return currentChart ? currentChart.blocks.some(b => !b.is_front) : false;
    if (tutorialStep === 4) return currentChart ? currentChart.blocks.some(b => b.student_id !== null) : false;
    if (tutorialStep === 5) return true;
    return true;
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-area, #printable-area * {
            visibility: visible !important;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #ffffff !important;
            padding: 20px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}>

        {/* Sidepanel */}
        <div style={{ width: '280px', minWidth: '260px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', zIndex: 10 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', fontSize: '1.2rem', fontWeight: 'bold', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LayoutGrid size={24} /> Klassekart
            </div>
            <button
              onClick={() => {
                setIsInteractiveTutorial(false);
                setTutorialStep(0);
                setShowTutorial(true);
              }}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Hjelp og veiledning"
            >
              <HelpCircle size={20} />
            </button>
          </div>

          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Velg klasse</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="F.eks. 10B..."
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none', minWidth: 0 }}
              />
              <button onClick={handleAddClass} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                <Plus size={16} /> Ny klasse
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: cls.id === selectedClassId ? '#eff6ff' : 'transparent',
                    color: cls.id === selectedClassId ? '#1d4ed8' : '#334155',
                    border: cls.id === selectedClassId ? '1px solid #bfdbfe' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls.name}</span>
                    <span style={{ fontSize: '0.7rem', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '10px', color: '#475569', flexShrink: 0 }}>{cls.students.length}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteClass(cls.id, e)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                    title="Slett klasse"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {currentClass && (
            <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Elevliste ({currentClass.students.length})</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Elevnavn..."
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
                  style={{ flex: 1, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', color: '#0f172a', outline: 'none', minWidth: 0 }}
                />
                <button onClick={handleAddStudent} style={{ backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                  <UserPlus size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {currentClass.students.map((std) => (
                  <div
                    key={std.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', std.id);
                      e.dataTransfer.effectAllowed = 'move';
                      const ghost = document.createElement('div');
                      ghost.textContent = std.name;
                      ghost.style.position = 'absolute';
                      ghost.style.top = '-1000px';
                      ghost.style.left = '-1000px';
                      ghost.style.padding = '6px 12px';
                      ghost.style.backgroundColor = '#e5e7eb';
                      ghost.style.color = '#374151';
                      ghost.style.fontSize = '0.75rem';
                      ghost.style.fontWeight = '600';
                      ghost.style.borderRadius = '6px';
                      ghost.style.whiteSpace = 'nowrap';
                      ghost.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 20, 20);
                      setTimeout(() => document.body.removeChild(ghost), 0);
                    }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', color: '#1e293b', fontWeight: 500, cursor: 'grab' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '4px' }}>{std.name}</span>
                    <button onClick={() => handleRemoveStudent(std.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
            <button
              onClick={handleWipeAllAppData}
              style={{ width: '100%', backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <AlertTriangle size={14} /> Tilbakestill / Slett all appdata
            </button>
          </div>
        </div>

        {/* Hovedinnhold */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', overflow: 'hidden' }}>

          <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {currentClass ? currentClass.name : 'Velg en klasse'}
              </h2>
              {currentClass && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={() => setShowChartDropdown(!showChartDropdown)}
                    style={{ fontSize: '0.85rem', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#eff6ff', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                  >
                    {currentClassroom?.name || 'Velg klasserom'}
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{showChartDropdown ? '▲' : '▼'}</span>
                  </button>
                  {showChartDropdown && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: '6px', minWidth: '220px', zIndex: 60, border: '1px solid #e2e8f0' }}>
                      {currentClass.classrooms.map((room) => (
                        <button
                          key={room.id}
                          onClick={() => { handleSelectChart(room.id); setShowChartDropdown(false); }}
                          style={{ width: '100%', textAlign: 'left', backgroundColor: room.id === selectedClassroomId ? '#eff6ff' : 'transparent', border: 'none', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveChart(room.id, e); }}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px', marginLeft: '8px', flexShrink: 0 }}
                            title="Slett klasserom"
                            disabled={currentClass.classrooms.length <= 1}
                          >
                            <Trash2 size={14} />
                          </button>
                        </button>
                      ))}
                      <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                      <button
                        onClick={() => { handleAddChart(); setShowChartDropdown(false); }}
                        style={{ width: '100%', textAlign: 'left', backgroundColor: '#059669', border: 'none', borderRadius: '6px', padding: '8px 10px', fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Plus size={16} /> Legg til nytt klasserom
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {currentClass && (
                <button
                  onClick={() => setShowExportModal(true)}
                  style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                  <Printer size={16} /> Skriv ut / Lagre kart
                </button>
              )}

              <div style={{ display: 'flex', background: '#e2e8f0', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                <button
                  onClick={() => { setMode('view'); setActiveBlockId(null); }}
                  style={{ fontSize: '0.85rem', padding: '8px 14px', background: mode === 'view' ? '#ffffff' : 'transparent', color: mode === 'view' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'view' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  <MousePointer size={15} /> Plassér elever
                </button>
                <button
                  onClick={() => { setMode('edit'); setActiveBlockId(null); }}
                  style={{ fontSize: '0.85rem', padding: '8px 14px', background: mode === 'edit' ? '#ffffff' : 'transparent', color: mode === 'edit' ? '#2563eb' : '#475569', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: mode === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                >
                  <Move size={15} /> Bygg / Flytt pulter
                </button>
              </div>
            </div>
          </div>

          {mode === 'edit' && currentChart && (
            <div style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Legg til pulter:</span>

              <button onClick={() => handleAddGroupShape(1)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                + 1 Pult
              </button>
              <button onClick={() => handleAddGroupShape(2)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                + 2-pult
              </button>
              <button onClick={() => handleAddGroupShape(3)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                + 3-pult
              </button>
              <button onClick={() => handleAddGroupShape(4)} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                + 4-pult (Firkant)
              </button>

              <div style={{ height: '20px', width: '2px', backgroundColor: '#cbd5e1', margin: '0 4px' }} />

              <button
                onClick={() => setSnapToGridEnabled(!snapToGridEnabled)}
                style={{
                  backgroundColor: snapToGridEnabled ? '#059669' : '#475569',
                  color: 'white', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Grid size={16} /> Snapp til rutenett: {snapToGridEnabled ? 'PÅ' : 'AV'}
              </button>

              <div style={{ flex: 1 }} />

              <button onClick={handleClearAllBlocks} style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={16} /> Slett alle pulter
              </button>
            </div>
          )}

          {/* Canvas-område med rikelig med padding slik at hele rutenettet alltid er synlig og sentrert */}
          <div style={{ flex: 1, position: 'relative', overflow: 'auto', padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', minHeight: `${CANVAS_HEIGHT + 80}px` }}>
            {currentChart ? (
              <div
                onMouseMove={(e) => {
                  if (!isDragging || mode !== 'edit' || !dragCluster) return;
                  const canvasRect = e.currentTarget.getBoundingClientRect();
                  const mouseX = e.clientX - canvasRect.left;
                  const mouseY = e.clientY - canvasRect.top;

                  let deltaX = mouseX - dragCluster.startX;
                  let deltaY = mouseY - dragCluster.startY;

                  updateCurrentChart((chart) => ({
                    ...chart,
                    blocks: chart.blocks.map((b) => {
                      const match = dragCluster.clusterOffsets.find(o => o.id === b.id);
                      if (match) {
                        const maxW = b.is_front ? CANVAS_WIDTH - (BLOCK_SIZE * 5) : CANVAS_WIDTH - BLOCK_SIZE;
                        let newX = Math.min(Math.max(0, match.offsetX + deltaX), maxW);
                        let newY = Math.min(Math.max(0, match.offsetY + deltaY), CANVAS_HEIGHT - BLOCK_SIZE);
                        return { ...b, x: newX, y: newY };
                      }
                      return b;
                    }),
                  }));
                }}
                onMouseUp={() => {
                  if (mode === 'edit' && dragCluster) {
                    handleDragStop(dragCluster.clusterOffsets.map(o => o.id));
                  }
                }}
                style={{
                  position: 'relative', width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, backgroundColor: '#f0f9ff', borderRadius: '16px', border: '2px solid #bae6fd', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)', overflow: 'hidden',
                  backgroundImage: 'radial-gradient(#38bdf8 1.5px, transparent 1.5px)', backgroundSize: '24px 24px', flexShrink: 0, margin: 'auto'
                }}
              >
                {currentChart.blocks.map((blk) => {
                  const isFront = blk.is_front;
                  const assignedStudent = !isFront ? currentClass?.students.find((s) => s.id === blk.student_id) : null;
                  const isBeingDragged = isDragging && dragCluster?.clusterOffsets.some(o => o.id === blk.id);
                  const blockStyle = getTableBlockStyle(blk, currentChart.blocks, !!assignedStudent, false, isBeingDragged);

                  return (
                    <div
                      key={blk.id}
                      onMouseDown={(e) => {
                        if (mode !== 'edit') return;
                        const canvasRect = e.currentTarget.parentElement!.getBoundingClientRect();
                        const startX = e.clientX - canvasRect.left;
                        const startY = e.clientY - canvasRect.top;

                        const clusterIds = getClusterBlockIds(blk.id, currentChart.blocks);
                        const clusterOffsets = currentChart.blocks
                          .filter(b => clusterIds.includes(b.id))
                          .map(b => ({ id: b.id, offsetX: b.x, offsetY: b.y }));

                        setIsDragging(true);
                        setDragCluster({ id: blk.id, startX, startY, clusterOffsets });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (isFront) return;
                        if (mode === 'edit') {
                          handleDeleteBlock(blk.id);
                        } else if (mode === 'view') {
                          if (blk.student_id) {
                            updateCurrentChart((chart) => ({
                              ...chart,
                              blocks: chart.blocks.map((b) => (b.id === blk.id ? { ...b, student_id: null } : b)),
                            }));
                          }
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (isFront) return;
                        if (mode === 'edit') {
                          handleDetachBlock(blk.id);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isFront) return;
                        if (mode === 'view') setActiveBlockId(blk.id);
                      }}
                      onDragOver={(e) => {
                        if (isFront) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverBlockId(blk.id);
                      }}
                      onDragLeave={() => setDragOverBlockId(null)}
                      onDrop={(e) => {
                        if (isFront) return;
                        e.preventDefault();
                        const studentId = e.dataTransfer.getData('text/plain');
                        if (studentId) {
                          updateCurrentChart((chart) => ({
                            ...chart,
                            blocks: chart.blocks.map((b) => {
                              if (b.id === blk.id) return { ...b, student_id: studentId };
                              if (b.student_id === studentId) return { ...b, student_id: null };
                              return b;
                            }),
                          }));
                          setDragOverBlockId(null);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        left: blk.x,
                        top: blk.y,
                        width: isFront ? (BLOCK_SIZE * 5) : BLOCK_SIZE,
                        height: BLOCK_SIZE,
                        ...blockStyle,
                        padding: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: mode === 'edit' ? 'grab' : (isFront ? 'default' : 'pointer'),
                        backgroundColor: isFront ? '#4f46e5' : (dragOverBlockId === blk.id ? '#047857' : (assignedStudent ? '#2563eb' : '#10b981')),
                        boxShadow: dragOverBlockId === blk.id ? '0 0 0 3px rgba(4,120,87,0.6)' : '0 4px 6px -1px rgba(0,0,0,0.08)',
                        transition: isDragging ? 'none' : 'background-color 0.15s'
                      }}
                      title={isFront ? 'Klasserommets (Tavle) - kan flyttes i redigeringsmodus' : (mode === 'edit' ? 'Høyreklikk for å slette, dobbeltklikk for å ufeste' : '')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '6px', fontWeight: 800, color: isFront ? '#c7d2fe' : (assignedStudent ? '#93c5fd' : '#a7f3d0'), textTransform: 'uppercase' }}>
                          {isFront ? 'Felles' : 'Pult'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: isFront ? '0.8rem' : getDynamicFontSize(assignedStudent ? assignedStudent.name : ''), color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', lineHeight: '1.1', width: '100%' }}>
                        {isFront ? 'TAVLE' : (assignedStudent ? assignedStudent.name : 'Ledig')}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '1rem', fontWeight: 600 }}>
                Opprett en klasse i menyen til venstre for å begynne.
              </div>
            )}

            {/* Elevvalg-meny ved klikk på pult */}
            {mode === 'view' && activeBlockId && currentClass && (
              <div style={{ position: 'absolute', right: '20px', top: '20px', width: '260px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '16px', zIndex: 50 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#2563eb', margin: 0 }}>Velg elev til pult:</h3>
                  <button onClick={() => setActiveBlockId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                  <button
                    onClick={() => handleAssignStudent(null)}
                    style={{ textAlign: 'left', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Tøm pult
                  </button>

                  <input
                    type="text"
                    placeholder="Søk elev..."
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    style={{ width: '100%', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', color: '#0f172a', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' }}
                  />

                  {currentClass.students
                    .filter((std) => std.name.toLowerCase().includes(searchStudent.toLowerCase()))
                    .map((std) => {
                      const activeBlock = currentChart ? currentChart.blocks.find(b => b.id === activeBlockId) : null;
                      const isSeatedOnThisBlock = activeBlock?.student_id === std.id;
                      const isSeatedElsewhere = currentChart ? currentChart.blocks.some(
                        (b) => b.student_id === std.id && b.id !== activeBlockId
                      ) : false;

                      return (
                        <button
                          key={std.id}
                          onClick={() => handleAssignStudent(std.id)}
                          style={{
                            textAlign: 'left', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '0.85rem', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{std.name}</span>
                          {isSeatedOnThisBlock && <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, flexShrink: 0, marginLeft: '4px' }}>Sitter her</span>}
                          {!isSeatedOnThisBlock && isSeatedElsewhere && <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 700, flexShrink: 0, marginLeft: '4px' }}>(Opptatt)</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tutorial Modal */}
        {showTutorial && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none' }}>
            
            {/* Dynamisk bakgrunn */}
            <div style={{
              position: 'absolute',
              top: 0,
              ...(tutorialStep <= 2 ? {
                left: '280px',
                right: 0,
                bottom: 0,
              } : {
                left: 0,
                width: '280px',
                bottom: 0,
              }),
              backgroundColor: 'rgba(0,0,0,0.4)',
              pointerEvents: 'auto'
            }} />

            {/* Selve veiledningsboksen */}
            <div style={{
              position: 'absolute',
              ...(tutorialStep <= 2 ? {
                top: '50%',
                left: 'calc(280px + (100vw - 280px) / 2)',
                transform: 'translate(-50%, -50%)',
                width: '460px',
              } : {
                top: '12px',
                left: '12px',
                transform: 'none',
                width: '256px',
              }),
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '90vw',
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto',
              padding: tutorialStep <= 2 ? '32px' : '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              pointerEvents: 'auto',
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box',
              transition: 'all 0.3s ease'
            }}>

              <button
                onClick={() => {
                  setShowTutorial(false);
                  localStorage.setItem('klassekart_seen_tutorial', 'true');
                }}
                style={{ position: 'absolute', right: tutorialStep <= 2 ? '20px' : '12px', top: tutorialStep <= 2 ? '20px' : '12px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={tutorialStep <= 2 ? 22 : 18} />
              </button>

              <div style={{ marginBottom: tutorialStep <= 2 ? '20px' : '12px', backgroundColor: '#f0f9ff', padding: tutorialStep <= 2 ? '20px' : '12px', borderRadius: '50%' }}>
                {tutorialSteps[tutorialStep].icon}
              </div>

              <h2 style={{ fontSize: tutorialStep <= 2 ? '1.4rem' : '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px', textAlign: 'center' }}>
                {tutorialSteps[tutorialStep].title}
              </h2>

              <div style={{ fontSize: tutorialStep <= 2 ? '0.95rem' : '0.82rem', color: '#475569', textAlign: 'left', lineHeight: '1.5', marginBottom: '20px', padding: '0 4px', whiteSpace: 'pre-line', width: '100%', boxSizing: 'border-box' }}>
                {tutorialSteps[tutorialStep].desc}
              </div>

              {isInteractiveTutorial && !isCurrentStepCompleted() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706', fontSize: '0.78rem', fontWeight: 700, marginBottom: '14px', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: '8px', width: '100%', justifyContent: 'center', boxSizing: 'border-box', textAlign: 'center' }}>
                  <Lock size={13} /> Gjør handlingen for å låse opp neste!
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
                {tutorialSteps.map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: tutorialStep === idx ? '20px' : '6px',
                      height: '6px',
                      borderRadius: '3px',
                      backgroundColor: tutorialStep === idx ? '#2563eb' : '#cbd5e1',
                      transition: 'all 0.3s'
                    }}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setTutorialStep(prev => Math.max(0, prev - 1))}
                  disabled={tutorialStep === 0}
                  style={{
                    flex: 1, backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: tutorialStep === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', opacity: tutorialStep === 0 ? 0.5 : 1
                  }}
                >
                  <ArrowLeft size={14} /> Forrige
                </button>

                {tutorialStep < tutorialSteps.length - 1 ? (
                  <button
                    onClick={() => {
                      if (isCurrentStepCompleted()) {
                        setTutorialStep(prev => prev + 1);
                      }
                    }}
                    disabled={isInteractiveTutorial && !isCurrentStepCompleted()}
                    style={{
                      flex: 1,
                      backgroundColor: isInteractiveTutorial && !isCurrentStepCompleted() ? '#94a3b8' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: isInteractiveTutorial && !isCurrentStepCompleted() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      opacity: isInteractiveTutorial && !isCurrentStepCompleted() ? 0.6 : 1
                    }}
                  >
                    Neste <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowTutorial(false);
                      localStorage.setItem('klassekart_seen_tutorial', 'true');
                    }}
                    style={{
                      flex: 1, backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', padding: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                    }}
                  >
                    Start! <CheckCircle2 size={14} />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setShowTutorial(false);
                  localStorage.setItem('klassekart_seen_tutorial', 'true');
                }}
                style={{
                  marginTop: '10px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Hopp over
              </button>

            </div>
          </div>
        )}

        {/* Eksport / Utskrifts-modal */}
        {showExportModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '1150px', maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', overflow: 'hidden' }}>

              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Skriv ut / lagre kart</h3>
                <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <div
                  ref={printAreaRef}
                  id="printable-area"
                  style={{
                    position: 'relative', width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden', padding: '20px', flexShrink: 0
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Klassekart: {currentClass?.name}</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>Dato: {new Date().toLocaleDateString('nb-NO')}</p>
                  </div>
                  <div style={{ position: 'relative', width: '100%', height: '580px' }}>
                    {currentChart?.blocks.map((blk) => {
                      const isFront = blk.is_front;
                      const assignedStudent = !isFront ? currentClass?.students.find((s) => s.id === blk.student_id) : null;
                      const blockStyle = getTableBlockStyle(blk, currentChart.blocks, !!assignedStudent, true);
                      return (
                        <div
                          key={blk.id}
                          style={{
                            position: 'absolute',
                            left: blk.x,
                            top: blk.y,
                            width: isFront ? (BLOCK_SIZE * 5) : BLOCK_SIZE,
                            height: BLOCK_SIZE,
                            ...blockStyle,
                            padding: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            backgroundColor: isFront ? '#4338ca' : '#2563eb',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          }}
                        >
                          <span style={{ fontSize: '6px', fontWeight: 800, color: isFront ? '#c7d2fe' : '#93c5fd', textTransform: 'uppercase' }}>
                            {isFront ? 'Felles' : 'Pult'}
                          </span>
                          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: isFront ? '0.8rem' : getDynamicFontSize(assignedStudent ? assignedStudent.name : ''), color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', lineHeight: '1.1', width: '100%' }}>
                            {isFront ? 'FRONT / TAVLE' : (assignedStudent ? assignedStudent.name : 'Ledig')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#ffffff' }}>
                <button
                  onClick={handleCopyClipboard}
                  style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={16} /> Kopier som tekst
                </button>
                <button
                  onClick={handlePrint}
                  style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={16} /> Skriv ut / PDF
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

      <div style={{ position: 'fixed', bottom: 0, right: 0, padding: '6px 12px', backgroundColor: 'transparent', color: '#9ca3af', fontSize: '0.65rem', fontWeight: 400, zIndex: 1000, pointerEvents: 'none', letterSpacing: '0.02em' }}>
        Noah Belstad © MIT license
      </div>
    </>
  );
}